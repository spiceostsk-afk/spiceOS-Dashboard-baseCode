import React, { useState } from 'react';
import {
  FileText, Printer, Edit3, CheckCircle2, CreditCard, Banknote, QrCode,
  X, Minus, Plus, Trash2, Check, ArrowLeftRight, Split, LayoutGrid, RefreshCw,
  Percent, Coffee, Receipt,
} from 'lucide-react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

function SessionHeader({ session, isPaid, onMoveTable, onSplit, onHold, onVoid, onClose }) {
  return (
    <div className="session-header">
      <div>
        <span className="session-label">BILLING CONTEXT</span>
        <h2>Table {session?.restaurant_tables?.table_number}</h2>
        <p className="customer-meta">
          {session?.customer_name} &bull; {session?.guest_count} Guests
        </p>
      </div>
      <div className="header-actions">
        <button className="action-pill" onClick={onHold} disabled={isPaid}>
          <Coffee size={14} /> Hold
        </button>
        <button className="action-pill" onClick={onMoveTable} disabled={isPaid}>
          <ArrowLeftRight size={14} /> Move
        </button>
        <button className="action-pill" onClick={onSplit} disabled={isPaid}>
          <Split size={14} /> Split
        </button>
        <button className="action-pill void-btn" onClick={onVoid} disabled={isPaid}>
          <X size={14} /> Void
        </button>
        <button className="action-pill close-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <style>{`
        .session-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 1rem; }
        .session-label { font-size: 0.7rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        h2 { font-size: 1.35rem; font-weight: 800; color: var(--color-primary); margin: 0.15rem 0; }
        .customer-meta { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; }
        .header-actions { display: flex; gap: 0.35rem; }
        .action-pill { display: flex; align-items: center; gap: 0.25rem; padding: 0.45rem 0.75rem; border: 1px solid var(--color-border); background: white; border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: var(--color-primary); cursor: pointer; }
        .action-pill:disabled { opacity: 0.5; cursor: not-allowed; }
        .action-pill.void-btn { color: #d9534f; }
        .action-pill.close-btn { color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}

function DiscountSection({ discountType, discountValue, subtotal, onSetType, onSetValue, isPaid }) {
  return (
    <div className="discount-section">
      <div className="discount-header">
        <Percent size={14} />
        <span>Discount</span>
      </div>
      <div className="discount-controls">
        <select value={discountType} onChange={(e) => onSetType(e.target.value)} disabled={isPaid}>
          <option value="none">No Discount</option>
          <option value="percentage">% Percentage</option>
          <option value="flat">Flat Amount</option>
        </select>
        {discountType !== 'none' && (
          <input
            type="number"
            min="0"
            max={discountType === 'percentage' ? 100 : subtotal}
            step={discountType === 'percentage' ? '1' : '0.01'}
            value={discountValue || ''}
            onChange={(e) => onSetValue(parseFloat(e.target.value) || 0)}
            placeholder={discountType === 'percentage' ? '% off' : 'Amount'}
            disabled={isPaid}
          />
        )}
      </div>
      <style>{`
        .discount-section { background: #F3E5F5; border: 1px solid #CE93D8; border-radius: 10px; padding: 0.75rem; }
        .discount-header { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 800; color: #7B1FA2; text-transform: uppercase; margin-bottom: 0.5rem; }
        .discount-controls { display: flex; gap: 0.35rem; }
        .discount-controls select { flex: 1; padding: 0.45rem; border-radius: 6px; border: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; }
        .discount-controls input { width: 100px; padding: 0.45rem; border-radius: 6px; border: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; text-align: center; }
        .discount-controls select:disabled, .discount-controls input:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function ServiceChargeToggle({ showServiceCharge, serviceChargePercent, onToggle, onSetPercent, isPaid }) {
  return (
    <div className="sc-section">
      <label className="sc-toggle">
        <input type="checkbox" checked={showServiceCharge} onChange={onToggle} disabled={isPaid} />
        <Coffee size={14} />
        <span>Service Charge</span>
      </label>
      {showServiceCharge && (
        <div className="sc-input-group">
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={serviceChargePercent || ''}
            onChange={(e) => onSetPercent(parseFloat(e.target.value) || 0)}
            disabled={isPaid}
          />
          <span>%</span>
        </div>
      )}
      <style>{`
        .sc-section { background: #E8F5E9; border: 1px solid #A5D6A7; border-radius: 10px; padding: 0.75rem; display: flex; align-items: center; gap: 1rem; }
        .sc-toggle { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 800; color: #2E7D32; text-transform: uppercase; cursor: pointer; }
        .sc-toggle input { margin: 0; }
        .sc-input-group { display: flex; align-items: center; gap: 0.25rem; margin-left: auto; }
        .sc-input-group input { width: 60px; padding: 0.35rem; border-radius: 6px; border: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; text-align: center; }
        .sc-input-group span { font-weight: 700; font-size: 0.8rem; color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}

function ItemsList({ items, sessionId, tableId, isEditing, isPaid, loadingAction, onEditItem, onUpdateQty, onDeleteItem, onToggleEdit, onNavigateMenu, isOnline }) {
  if (items.length === 0) {
    return (
      <div className="empty-order-msg">
        {isOnline ? 'No items punched for this session yet.' : 'No items yet. Use "Manual Order Entry" below to add items.'}
        {isOnline && (
          <button className="add-items-link" onClick={onNavigateMenu} disabled={isPaid}>
            Go to Menu Catalog
          </button>
        )}
        <style>{`
          .empty-order-msg { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; color: var(--color-text-muted); font-size: 0.85rem; padding: 3rem 1rem; }
          .add-items-link { background: var(--color-primary); color: white; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; }
          .add-items-link:disabled { opacity: 0.5; cursor: not-allowed; }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div className="bill-items-list">
        {items.map((item) => (
          <div key={item.id} className="bill-item-card">
            {isEditing ? (
              <div className="inline-qty-control">
                <button className="inline-qty-btn" onClick={() => onUpdateQty(item, item.qty - 1)} disabled={loadingAction}>
                  <Minus size={10} />
                </button>
                <span className="inline-qty-val">{item.qty}x</span>
                <button className="inline-qty-btn" onClick={() => onUpdateQty(item, item.qty + 1)} disabled={loadingAction}>
                  <Plus size={10} />
                </button>
                <button className="inline-delete-btn" onClick={() => onDeleteItem(item)} disabled={loadingAction}>
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <div className="item-qty-box">{item.qty}x</div>
            )}
            <div className="item-main-info">
              <h4>{item.name}</h4>
              <p>Standard preparation</p>
            </div>
            <div className="item-meta">
              <span className="item-price">{FORMAT_CURRENCY.format(item.price * item.qty)}</span>
            </div>
            {!isEditing && (
              <button className="edit-btn" onClick={() => onEditItem(item)} disabled={isPaid}>
                <Edit3 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="session-footer-actions">
        <button className="footer-btn" disabled={isPaid}>
          <FileText size={18} /> Merge Bill
        </button>
        <button className="footer-btn">
          <Printer size={18} /> Print KOT
        </button>
        <button className={`footer-btn ${isEditing ? 'active-edit' : ''}`} onClick={onToggleEdit} disabled={isPaid}>
          {isEditing ? <Check size={18} /> : <Edit3 size={18} />}
          {isEditing ? 'Finish Qty' : 'Edit Qty'}
        </button>
      </div>

      <style>{`
        .bill-items-list { display: flex; flex-direction: column; gap: 0.5rem; overflow-y: auto; flex: 1; }
        .bill-item-card { border: 1px solid var(--color-border); border-radius: 10px; padding: 0.75rem; display: flex; align-items: center; gap: 1rem; }
        .item-qty-box { width: 32px; height: 32px; background: var(--color-accent-soft); color: var(--color-primary); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; }
        .item-main-info h4 { font-size: 0.9rem; font-weight: 700; color: var(--color-primary); margin: 0; }
        .item-main-info p { font-size: 0.75rem; color: var(--color-text-muted); margin: 0; }
        .item-meta { margin-left: auto; }
        .item-price { font-size: 0.9rem; font-weight: 800; color: var(--color-primary); }
        .edit-btn { color: var(--color-text-muted); cursor: pointer; background: none; border: none; }
        .edit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .inline-qty-control { display: flex; align-items: center; gap: 0.35rem; background: var(--color-bg); padding: 0.2rem 0.4rem; border-radius: 6px; }
        .inline-qty-btn { width: 24px; height: 24px; border-radius: 4px; background: white; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--color-primary); cursor: pointer; }
        .inline-qty-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .inline-qty-val { font-weight: 700; font-size: 0.85rem; min-width: 20px; text-align: center; }
        .inline-delete-btn { color: #d9534f; cursor: pointer; background: none; border: none; }
        .session-footer-actions { display: flex; gap: 0.5rem; }
        .footer-btn { flex: 1; background: var(--color-sidebar); color: var(--color-primary); border: 1px solid var(--color-border); border-radius: 8px; padding: 0.6rem; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.35rem; font-size: 0.8rem; cursor: pointer; }
        .footer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .footer-btn.active-edit { background: #E8F5E9; color: #2E7D32; border-color: #2E7D32; }
      `}</style>
    </>
  );
}

function InvoicePreview({ session, items, subtotal, discountAmount, serviceCharge, cgst, sgst, total, isPaid, discountType, discountValue, showServiceCharge, serviceChargePercent }) {
  return (
    <div className="invoice-paper">
      <div className="receipt-logo">
        <h4>Spice OS</h4>
        <p>123 Downtown St, Metro</p>
        <p>Tel: +91 90812 01234</p>
      </div>
      <div className="receipt-meta">
        <div><p>Table</p><strong>T-{session?.restaurant_tables?.table_number}</strong></div>
        <div><p>Bill #</p><strong>{session?.id?.slice(0, 4).toUpperCase()}</strong></div>
        <div><p>Date</p><strong>{session?.started_at ? new Date(session.started_at).toLocaleDateString() : ''}</strong></div>
      </div>
      <div className="receipt-items">
        {items.map((item, idx) => (
          <div key={idx} className="receipt-row">
            <span>{item.qty}x {item.name}</span>
            <span>{FORMAT_CURRENCY.format(item.price * item.qty)}</span>
          </div>
        ))}
      </div>
      <div className="receipt-totals">
        <div className="receipt-row"><span>Subtotal</span><span>{FORMAT_CURRENCY.format(subtotal)}</span></div>
        {discountAmount > 0 && (
          <div className="receipt-row discount"><span>Discount {discountType === 'percentage' ? `(${discountValue}%)` : ''}</span><span>-{FORMAT_CURRENCY.format(discountAmount)}</span></div>
        )}
        {showServiceCharge && serviceCharge > 0 && (
          <div className="receipt-row"><span>Service Charge ({serviceChargePercent}%)</span><span>{FORMAT_CURRENCY.format(serviceCharge)}</span></div>
        )}
        <div className="receipt-row"><span>CGST (5%)</span><span>{FORMAT_CURRENCY.format(cgst)}</span></div>
        <div className="receipt-row"><span>SGST (5%)</span><span>{FORMAT_CURRENCY.format(sgst)}</span></div>
        <div className="receipt-row total"><span>Grand Total</span><span>{FORMAT_CURRENCY.format(total)}</span></div>
      </div>
      <style>{`
        .invoice-paper { background: white; border-radius: 10px; padding: 1.25rem; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 1rem; }
        .receipt-logo { text-align: center; }
        .receipt-logo h4 { font-size: 1.05rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .receipt-logo p { font-size: 0.7rem; color: var(--color-text-muted); margin: 0; }
        .receipt-meta { display: flex; justify-content: space-between; border-top: 1px dashed var(--color-border); border-bottom: 1px dashed var(--color-border); padding: 0.5rem 0; }
        .receipt-meta div p { font-size: 0.65rem; color: var(--color-text-muted); margin: 0; }
        .receipt-meta div strong { font-size: 0.75rem; color: var(--color-primary); }
        .receipt-items { display: flex; flex-direction: column; gap: 0.45rem; }
        .receipt-row { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; }
        .receipt-row.discount { color: #d9534f; }
        .receipt-totals { border-top: 1px dashed var(--color-border); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
        .receipt-totals .receipt-row.total { font-size: 1.15rem; font-weight: 800; color: var(--color-primary); margin-top: 0.25rem; }
      `}</style>
    </div>
  );
}

function SplitPaymentBlock({ splitPayments, total, remainingBalance, isPaid, onUpdateSplitPayment, onAddSplit, onRemoveSplit, onSettlePartial }) {
  const methods = [
    { key: 'cash', label: 'Cash', icon: Banknote },
    { key: 'card', label: 'Card', icon: CreditCard },
    { key: 'upi', label: 'UPI', icon: QrCode },
  ];

  const splitTotal = splitPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = total - splitTotal;

  return (
    <div className="split-payment-block">
      <h4>Split Payment</h4>
      {splitPayments.map((sp, idx) => (
        <div key={idx} className="split-pay-row">
          <select value={sp.method} onChange={(e) => onUpdateSplitPayment(idx, { ...sp, method: e.target.value })} disabled={isPaid}>
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
          />
          {splitPayments.length > 1 && (
            <button className="remove-split-btn" onClick={() => onRemoveSplit(idx)} disabled={isPaid}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <div className="split-actions">
        <button className="add-split-btn" onClick={onAddSplit} disabled={isPaid}>
          + Add Method
        </button>
        {balance > 0 && (
          <span className="balance-remaining">Balance: {FORMAT_CURRENCY.format(balance)}</span>
        )}
      </div>
      <button className="partial-settle-btn" onClick={onSettlePartial} disabled={isPaid || splitTotal <= 0}>
        Pay {FORMAT_CURRENCY.format(splitTotal)}
      </button>
      <style>{`
        .split-payment-block { background: #E3F2FD; border: 1px solid #90CAF9; border-radius: 10px; padding: 0.75rem; }
        .split-payment-block h4 { font-size: 0.75rem; font-weight: 800; color: #1565C0; text-transform: uppercase; margin: 0 0 0.5rem 0; }
        .split-pay-row { display: flex; gap: 0.35rem; margin-bottom: 0.35rem; }
        .split-pay-row select { flex: 1; padding: 0.45rem; border-radius: 6px; border: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; }
        .split-pay-row input { width: 100px; padding: 0.45rem; border-radius: 6px; border: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; text-align: center; }
        .remove-split-btn { color: #d9534f; background: none; border: none; cursor: pointer; }
        .split-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem; }
        .add-split-btn { background: none; border: 1px dashed var(--color-border); border-radius: 6px; padding: 0.35rem 0.65rem; font-size: 0.75rem; font-weight: 700; color: #1565C0; cursor: pointer; }
        .balance-remaining { font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); }
        .partial-settle-btn { width: 100%; margin-top: 0.5rem; background: #1565C0; color: white; border: none; padding: 0.65rem; border-radius: 8px; font-weight: 800; font-size: 0.85rem; cursor: pointer; }
        .partial-settle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function PaymentBlock({ paymentMethod, total, isPaid, itemsEmpty, loadingAction, onSelectPayment, onSettle, onPrint }) {
  return (
    <div className="payment-action-block">
      <div className="payment-options">
        <button className={`pay-opt ${paymentMethod === 'card' ? 'active' : ''}`} onClick={() => onSelectPayment('card')} disabled={isPaid}>
          <CreditCard size={16} /> Card
        </button>
        <button className={`pay-opt ${paymentMethod === 'cash' ? 'active' : ''}`} onClick={() => onSelectPayment('cash')} disabled={isPaid}>
          <Banknote size={16} /> Cash
        </button>
        <button className={`pay-opt ${paymentMethod === 'qr' ? 'active' : ''}`} onClick={() => onSelectPayment('qr')} disabled={isPaid}>
          <QrCode size={16} /> UPI QR
        </button>
      </div>
      <button className="pay-settle-btn" onClick={onSettle} disabled={isPaid || itemsEmpty || loadingAction}>
        <CheckCircle2 size={18} /> {isPaid ? 'PAID & COMPLETED' : `SETTLE ${FORMAT_CURRENCY.format(total)}`}
      </button>
      <div className="print-sub-actions">
        <button className="sub-btn" onClick={onPrint}><Printer size={14} /> Print Bill</button>
      </div>
      <style>{`
        .payment-action-block { display: flex; flex-direction: column; gap: 0.75rem; }
        .payment-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; }
        .pay-opt { border: 1px solid var(--color-border); border-radius: 8px; background: white; padding: 0.5rem; font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; gap: 0.25rem; cursor: pointer; }
        .pay-opt.active { background: var(--color-accent-soft); color: var(--color-primary); border-color: var(--color-primary); }
        .pay-opt:disabled { opacity: 0.5; cursor: not-allowed; }
        .pay-settle-btn { background: var(--color-primary); color: white; border: none; padding: 0.85rem; border-radius: 10px; font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem; cursor: pointer; }
        .pay-settle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .print-sub-actions { display: flex; }
        .sub-btn { flex: 1; background: white; border: 1px solid var(--color-border); border-radius: 8px; padding: 0.5rem; font-size: 0.75rem; font-weight: 700; color: var(--color-primary); display: flex; align-items: center; justify-content: center; gap: 0.25rem; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default function BillingDetails({
  sessionId,
  session,
  items,
  loading,
  error,
  isPaid,
  subtotal,
  discountAmount,
  serviceCharge,
  cgst,
  sgst,
  total,
  paymentMethod,
  isEditingQuantities,
  loadingAction,
  discountType,
  discountValue,
  showServiceCharge,
  serviceChargePercent,
  splitPayments,
  onCloseSession,
  onNavigateMenu,
  onEditItem,
  onUpdateQty,
  onDeleteItem,
  onToggleEdit,
  onSelectPayment,
  onSettle,
  onPrint,
  onMoveTable,
  onSplit,
  onHold,
  onVoid,
  isOnline,
  onAddManualItem,
  onSetDiscountType,
  onSetDiscountValue,
  onToggleServiceCharge,
  onSetServiceChargePercent,
  onUpdateSplitPayment,
  onAddSplitPayment,
  onRemoveSplitPayment,
  onSettlePartial,
}) {
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [manualPrice, setManualPrice] = useState('');

  if (!sessionId) {
    return (
      <div className="no-session-details">
        <LayoutGrid size={40} strokeWidth={1} />
        <h4>Select an active table on the left</h4>
        <p>Select any table or order to display item details and process invoice settlements</p>
        <style>{`
          .no-session-details { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4rem 2rem; color: var(--color-text-muted); height: 100%; gap: 0.5rem; }
          .no-session-details h4 { font-size: 1.05rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .no-session-details p { font-size: 0.8rem; max-width: 240px; line-height: 1.4; }
        `}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" /> Loading session bill details...
        <style>{`
          .loading-state { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 4rem; font-weight: 700; color: var(--color-text-muted); }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>Failed to load session: {error}</p>
        <style>{`
          .error-state { display: flex; align-items: center; justify-content: center; padding: 4rem; color: var(--color-text-muted); font-weight: 600; }
        `}</style>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="no-session-details">
        <p>Active Session could not be loaded.</p>
        <style>{`
          .no-session-details { display: flex; align-items: center; justify-content: center; padding: 4rem; color: var(--color-text-muted); font-weight: 600; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="billing-details-wrapper">
      <SessionHeader session={session} isPaid={isPaid} onMoveTable={onMoveTable} onSplit={onSplit} onHold={onHold} onVoid={onVoid} onClose={onCloseSession} />

      <ItemsList
        items={items}
        sessionId={sessionId}
        tableId={session.table_id}
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
        <>
          <DiscountSection
            discountType={discountType}
            discountValue={discountValue}
            subtotal={subtotal}
            onSetType={onSetDiscountType}
            onSetValue={onSetDiscountValue}
            isPaid={isPaid}
          />
          <ServiceChargeToggle
            showServiceCharge={showServiceCharge}
            serviceChargePercent={serviceChargePercent}
            onToggle={onToggleServiceCharge}
            onSetPercent={onSetServiceChargePercent}
            isPaid={isPaid}
          />
        </>
      )}

      {!isPaid && !isOnline && (
        <div className="manual-entry-section">
          <h4>Manual Order Entry</h4>
          <div className="manual-entry-row">
            <input type="text" placeholder="Item name..." value={manualName} onChange={(e) => setManualName(e.target.value)} className="manual-input name-input" />
            <input type="number" min="1" value={manualQty} onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value) || 1))} className="manual-input qty-input" />
            <input type="number" min="0" step="0.01" placeholder="Price" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="manual-input price-input" />
            <button className="manual-add-btn" disabled={!manualName || !manualPrice || loadingAction} onClick={() => { onAddManualItem(manualName, manualQty, parseFloat(manualPrice)); setManualName(''); setManualQty(1); setManualPrice(''); }}>
              Add
            </button>
          </div>
          <style>{`
            .manual-entry-section { background: #FFF8E1; border: 1px solid #FFE082; border-radius: 10px; padding: 0.75rem; }
            .manual-entry-section h4 { font-size: 0.75rem; font-weight: 800; color: #E65100; margin: 0 0 0.5rem 0; text-transform: uppercase; letter-spacing: 0.3px; }
            .manual-entry-row { display: flex; gap: 0.35rem; align-items: center; }
            .manual-input { padding: 0.45rem 0.5rem; border-radius: 6px; border: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; color: var(--color-primary); outline: none; }
            .name-input { flex: 1; min-width: 0; }
            .qty-input { width: 44px; text-align: center; }
            .price-input { width: 80px; }
            .manual-add-btn { padding: 0.45rem 0.75rem; background: var(--color-primary); color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; white-space: nowrap; }
            .manual-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          `}</style>
        </div>
      )}

      <div className="invoice-settlement-block">
        <div className="invoice-header">
          <h3>Bill Invoice {isPaid && <span className="paid-badge">&bull; PAID</span>}</h3>
        </div>
        <InvoicePreview session={session} items={items} subtotal={subtotal} discountAmount={discountAmount} serviceCharge={serviceCharge} cgst={cgst} sgst={sgst} total={total} isPaid={isPaid} discountType={discountType} discountValue={discountValue} showServiceCharge={showServiceCharge} serviceChargePercent={serviceChargePercent} />
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
      </div>

      <style>{`
        .billing-details-wrapper { padding: 1.5rem; display: flex; flex-direction: column; height: 100%; gap: 1.5rem; }
        .invoice-settlement-block { background: var(--color-sidebar); border-radius: 16px; padding: 1rem; border: 1px solid var(--color-border); }
        .invoice-header h3 { font-size: 0.95rem; font-weight: 800; color: var(--color-primary); margin: 0 0 0.75rem 0; }
        .paid-badge { color: #2e7d32; font-size: 0.85rem; }
      `}</style>
    </div>
  );
}