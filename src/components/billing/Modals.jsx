import React from 'react';
import { X, ArrowRight } from 'lucide-react';

function Modal({ onClose, title, width, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={width ? { width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

function GuestSelector({ guests, onChange }) {
  return (
    <div className="guest-grid">
      {[1, 2, 3, 4, 5, 6, 8].map((n) => (
        <button key={n} type="button" className={guests === n ? 'on' : ''} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
      <style>{`
        .guest-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .guest-grid button {
          height: 40px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-surface);
          font-size: 13.5px;
          font-weight: 600;
          color: var(--color-text-soft);
        }
        .guest-grid button.on {
          background: var(--color-text);
          border-color: var(--color-text);
          color: #fff;
        }
      `}</style>
    </div>
  );
}

export function AssignTableModal({ table, customerData, loadingAction, onClose, onUpdateField, onUpdateGuests, onSubmit }) {
  return (
    <Modal onClose={onClose} title={`Open table ${table.table_number}`}>
      <form onSubmit={onSubmit} className="modal__body">
        <div className="field">
          <label>Guest name</label>
          <input
            type="text"
            placeholder="e.g. Rajesh Kumar"
            value={customerData.name}
            onChange={(e) => onUpdateField('name', e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Phone</label>
          <input
            type="tel"
            placeholder="+91"
            value={customerData.phone}
            onChange={(e) => onUpdateField('phone', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Guests</label>
          <GuestSelector guests={customerData.guests} onChange={onUpdateGuests} />
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={loadingAction}>
            Open table <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function MoveTableModal({ availableTables, selectedMoveTableId, loadingAction, onClose, onSelectTable, onConfirm }) {
  return (
    <Modal onClose={onClose} title="Move table">
      <div className="field">
        <label>Target table</label>
        {loadingAction ? (
          <div className="card__subtitle">Loading available tables…</div>
        ) : availableTables.length === 0 ? (
          <div className="card__subtitle" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
            No available tables to move to.
          </div>
        ) : (
          <select value={selectedMoveTableId} onChange={(e) => onSelectTable(e.target.value)}>
            {availableTables.map((t) => (
              <option key={t.id} value={t.id}>Table {t.table_number} ({t.capacity} seats)</option>
            ))}
          </select>
        )}
      </div>
      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn--primary"
          onClick={onConfirm}
          disabled={availableTables.length === 0 || loadingAction}
        >
          Confirm move
        </button>
      </div>
    </Modal>
  );
}

export function MergeOrderModal({ occupiedSessions, selectedMergeSessionId, loadingAction, onClose, onSelectSession, onConfirm }) {
  return (
    <Modal onClose={onClose} title="Merge order">
      <div className="field">
        <label>Session to merge into this bill</label>
        {loadingAction ? (
          <div className="card__subtitle">Loading sessions…</div>
        ) : occupiedSessions.length === 0 ? (
          <div className="card__subtitle">No other occupied tables to merge.</div>
        ) : (
          <select value={selectedMergeSessionId} onChange={(e) => onSelectSession(e.target.value)}>
            {occupiedSessions.map((s) => (
              <option key={s.id} value={s.id}>
                Table {s.restaurant_tables?.table_number} ({s.customer_name || 'Walk-in'})
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn--primary"
          onClick={onConfirm}
          disabled={occupiedSessions.length === 0 || loadingAction}
        >
          Confirm merge
        </button>
      </div>
    </Modal>
  );
}

export function SplitBillModal({ splitTab, splitWays, total, items, itemAssignments, onClose, onSetTab, onSetWays, onAssignItem, onPrintSplit }) {
  return (
    <Modal onClose={onClose} title="Split bill" width="480px">
      <div className="segmented" style={{ alignSelf: 'flex-start' }}>
        <button className={splitTab === 'equal' ? 'on' : ''} onClick={() => onSetTab('equal')}>Split equally</button>
        <button className={splitTab === 'items' ? 'on' : ''} onClick={() => onSetTab('items')}>Split by items</button>
      </div>

      {splitTab === 'equal' && (
        <>
          <div className="split-ways">
            <span>Split into</span>
            <input
              type="number"
              min="2"
              max="6"
              value={splitWays}
              onChange={(e) => onSetWays(Math.max(2, parseInt(e.target.value, 10) || 2))}
            />
            <span>ways</span>
          </div>
          <div className="split-list">
            {Array.from({ length: splitWays }).map((_, i) => (
              <div key={i} className="split-card">
                <div style={{ flex: 1 }}>
                  <div className="card__subtitle">Share {i + 1} of {splitWays}</div>
                  <div className="split-amount tnum">₹{(total / splitWays).toFixed(2)}</div>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => onPrintSplit(i + 1, splitWays)}>
                  Print share
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {splitTab === 'items' && (
        <div className="split-list">
          {items.map((item) => (
            <div key={item.id} className="split-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="split-name">{item.name}</div>
                <div className="card__subtitle tnum">{item.qty}× · ₹{(item.price * item.qty).toFixed(2)}</div>
              </div>
              <div className="chip-row">
                <button
                  className={`chip ${itemAssignments[item.id] === 'A' ? 'on' : ''}`}
                  onClick={() => onAssignItem(item.id, 'A')}
                >
                  Bill A
                </button>
                <button
                  className={`chip ${itemAssignments[item.id] === 'B' ? 'on' : ''}`}
                  onClick={() => onAssignItem(item.id, 'B')}
                >
                  Bill B
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .split-ways {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--color-text-soft);
        }
        .split-ways input {
          width: 64px;
          height: 36px;
          border: 1px solid var(--color-border);
          border-radius: 9px;
          text-align: center;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          outline: none;
        }
        .split-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
        }
        .split-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--color-canvas);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 12px 14px;
        }
        .split-amount { font-size: 17px; font-weight: 800; color: var(--color-text); }
        .split-name {
          font-size: 13.5px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </Modal>
  );
}

export function EditItemModal({ item, qty, loadingAction, onClose, onSetQty, onDelete, onSave }) {
  return (
    <Modal onClose={onClose} title={`Edit ${item?.name || 'item'}`}>
      <div className="qty-editor">
        <div className="drawer__label" style={{ margin: 0 }}>Quantity</div>
        <div className="qty-editor__controls">
          <button type="button" onClick={() => onSetQty(Math.max(0, qty - 1))}>−</button>
          <span className="tnum">{qty}</span>
          <button type="button" onClick={() => onSetQty(qty + 1)}>+</button>
        </div>
      </div>

      <div className="modal__actions" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn--danger" onClick={onDelete} disabled={loadingAction}>
          Delete item
        </button>
        <button className="btn btn--primary" onClick={onSave} disabled={loadingAction}>
          Save changes
        </button>
      </div>

      <style>{`
        .qty-editor {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 20px 0;
        }
        .qty-editor__controls { display: flex; align-items: center; gap: 20px; }
        .qty-editor__controls button {
          width: 44px;
          height: 44px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-surface);
          font-size: 20px;
          font-weight: 700;
          color: var(--color-text);
        }
        .qty-editor__controls button:hover { background: var(--color-canvas); }
        .qty-editor__controls span { font-size: 24px; font-weight: 800; min-width: 40px; text-align: center; }
      `}</style>
    </Modal>
  );
}

export function VoidBillModal({ voidReason, loadingAction, onClose, onSetReason, onConfirm }) {
  return (
    <Modal onClose={onClose} title="Void bill">
      <div className="field">
        <label>Reason for voiding</label>
        <textarea
          value={voidReason}
          onChange={(e) => onSetReason(e.target.value)}
          placeholder="Why is this bill being voided?"
          rows={3}
          style={{ resize: 'vertical' }}
        />
      </div>
      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn--danger"
          onClick={onConfirm}
          disabled={!voidReason.trim() || loadingAction}
        >
          Void bill
        </button>
      </div>
    </Modal>
  );
}

export function ReprintBillModal({ session, onClose }) {
  if (!session) return null;

  const completed = session.session_status === 'completed';

  return (
    <Modal
      onClose={onClose}
      title={`Bill reprint · Table ${session.restaurant_tables?.table_number || '—'}`}
      width="480px"
    >
      <div className="reprint">
        <div className="reprint__logo">
          <div className="reprint__name">Spice OS</div>
          <div>123 Downtown St, Metro</div>
        </div>
        <div className="reprint__meta">
          <div><span>Customer</span><b>{session.customer_name || 'Walk-in'}</b></div>
          <div><span>Date</span><b>{session.ended_at ? new Date(session.ended_at).toLocaleDateString() : '—'}</b></div>
          <div><span>Bill #</span><b>{session.id?.slice(0, 4).toUpperCase()}</b></div>
        </div>
        <div className="reprint__status">
          <span className={`pill ${completed ? 'tone-green' : 'tone-red'}`}>
            {session.session_status}
          </span>
        </div>
        <div className="reprint__note">This is a reprinted copy of the original bill.</div>
      </div>

      <div className="modal__actions">
        <button className="btn btn--primary" onClick={onClose}>Close</button>
      </div>

      <style>{`
        .reprint {
          background: var(--color-canvas);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-size: 12.5px;
          color: var(--color-text-soft);
        }
        .reprint__logo { text-align: center; }
        .reprint__name { font-size: 15px; font-weight: 800; color: var(--color-text); }
        .reprint__meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          border-top: 1px dashed var(--color-border-strong);
          border-bottom: 1px dashed var(--color-border-strong);
          padding: 8px 0;
        }
        .reprint__meta span { display: block; font-size: 11px; color: var(--color-text-muted); }
        .reprint__meta b { font-size: 12.5px; color: var(--color-text); }
        .reprint__status { display: flex; justify-content: center; }
        .reprint__note { text-align: center; color: var(--color-text-muted); }
      `}</style>
    </Modal>
  );
}
