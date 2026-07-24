import React from 'react';
import { X, User, Phone, Users, ArrowRight, ArrowLeftRight, FileText } from 'lucide-react';

function ModalOverlay({ onClose, children, width }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={width ? { width } : {}} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-container { background: white; width: 420px; border-radius: 20px; box-shadow: var(--shadow-soft); overflow: hidden; border: 1px solid var(--color-border); }
      `}</style>
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div className="modal-header">
      <h2>{title}</h2>
      <button className="close-modal" onClick={onClose}><X size={20} /></button>
      <style>{`
        .modal-header { padding: 1.25rem 1.5rem; background: var(--color-sidebar); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
        .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
        .close-modal { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
      `}</style>
    </div>
  );
}

function GuestSelector({ guests, onChange }) {
  return (
    <div className="guest-selector">
      {[1, 2, 3, 4, 5, 6, 8].map((n) => (
        <button key={n} type="button" className={guests === n ? 'active' : ''} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
      <style>{`
        .guest-selector { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.35rem; }
        .guest-selector button { padding: 0.6rem; border: 1px solid var(--color-border); border-radius: 8px; font-weight: 700; color: var(--color-text-muted); background: white; cursor: pointer; }
        .guest-selector button.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
      `}</style>
    </div>
  );
}

export function AssignTableModal({ table, customerData, loadingAction, onClose, onUpdateField, onUpdateGuests, onSubmit }) {
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title={`Open Table ${table.table_number}`} onClose={onClose} />
      <form onSubmit={onSubmit} className="modal-form">
        <div className="form-group">
          <label><User size={14} /> Guest Name</label>
          <input type="text" placeholder="Enter guest name..." value={customerData.name} onChange={(e) => onUpdateField('name', e.target.value)} required />
        </div>
        <div className="form-group">
          <label><Phone size={14} /> Phone Number</label>
          <input type="tel" placeholder="Enter phone number..." value={customerData.phone} onChange={(e) => onUpdateField('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label><Users size={14} /> Guest Count</label>
          <GuestSelector guests={customerData.guests} onChange={onUpdateGuests} />
        </div>
        <div className="modal-footer">
          <button type="submit" className="start-btn" disabled={loadingAction}>
            Open Table & Order <ArrowRight size={16} />
          </button>
        </div>
      </form>
      <style>{`
        .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-group label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); }
        .form-group input, .form-group select { padding: 0.75rem 0.85rem; border-radius: 10px; border: 1px solid var(--color-border); font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
        .modal-footer { margin-top: 0.75rem; }
        .start-btn { width: 100%; background: var(--color-primary); color: white; padding: 0.95rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border: none; cursor: pointer; }
        .start-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </ModalOverlay>
  );
}

export function MoveTableModal({ availableTables, selectedMoveTableId, loadingAction, onClose, onSelectTable, onConfirm }) {
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Move Table" onClose={onClose} />
      <div className="modal-form">
        <div className="form-group">
          <label>Select Target Table</label>
          {loadingAction ? (
            <p style={{ fontSize: '0.9rem', color: '#888' }}>Loading available tables...</p>
          ) : availableTables.length === 0 ? (
            <p style={{ color: '#d9534f', fontWeight: 700 }}>No available tables to move to.</p>
          ) : (
            <select value={selectedMoveTableId} onChange={(e) => onSelectTable(e.target.value)}>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>Table {t.table_number} ({t.capacity} Seats)</option>
              ))}
            </select>
          )}
        </div>
        <button className="start-btn" onClick={onConfirm} disabled={availableTables.length === 0 || loadingAction}>
          Confirm Move
        </button>
      </div>
      <style>{`
        .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-group label { font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); }
        .form-group select { padding: 0.75rem 0.85rem; border-radius: 10px; border: 1px solid var(--color-border); font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
        .start-btn { width: 100%; background: var(--color-primary); color: white; padding: 0.95rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border: none; cursor: pointer; }
        .start-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </ModalOverlay>
  );
}

export function MergeOrderModal({ occupiedSessions, selectedMergeSessionId, loadingAction, onClose, onSelectSession, onConfirm }) {
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Merge Order" onClose={onClose} />
      <div className="modal-form">
        <div className="form-group">
          <label>Select Table Session to Merge Into This Bill</label>
          {loadingAction ? (
            <p style={{ fontSize: '0.9rem', color: '#888' }}>Loading sessions...</p>
          ) : occupiedSessions.length === 0 ? (
            <p style={{ color: '#888', fontWeight: 600 }}>No other occupied tables to merge.</p>
          ) : (
            <select value={selectedMergeSessionId} onChange={(e) => onSelectSession(e.target.value)}>
              {occupiedSessions.map((s) => (
                <option key={s.id} value={s.id}>Table {s.restaurant_tables?.table_number} ({s.customer_name || 'Guest'})</option>
              ))}
            </select>
          )}
        </div>
        <button className="start-btn" onClick={onConfirm} disabled={occupiedSessions.length === 0 || loadingAction}>
          Confirm Merge
        </button>
      </div>
      <style>{`
        .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-group label { font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); }
        .form-group select { padding: 0.75rem 0.85rem; border-radius: 10px; border: 1px solid var(--color-border); font-size: 0.9rem; color: var(--color-primary); font-weight: 600; background: white; outline: none; }
        .start-btn { width: 100%; background: var(--color-primary); color: white; padding: 0.95rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border: none; cursor: pointer; }
        .start-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </ModalOverlay>
  );
}

export function SplitBillModal({ splitTab, splitWays, total, subtotal, items, itemAssignments, onClose, onSetTab, onSetWays, onAssignItem, onPrintSplit }) {
  return (
    <ModalOverlay onClose={onClose} width="480px">
      <ModalHeader title="Split Bill" onClose={onClose} />
      <div style={{ padding: '1.5rem' }}>
        <div className="modal-tabs">
          <button className={`modal-tab ${splitTab === 'equal' ? 'active' : ''}`} onClick={() => onSetTab('equal')}>Split Equally</button>
          <button className={`modal-tab ${splitTab === 'items' ? 'active' : ''}`} onClick={() => onSetTab('items')}>Split by Items</button>
        </div>

        {splitTab === 'equal' && (
          <div>
            <div className="split-ways-selector">
              <span>Split into:</span>
              <input type="number" min="2" max="6" value={splitWays} onChange={(e) => onSetWays(Math.max(2, parseInt(e.target.value) || 2))} />
              <span>ways</span>
            </div>
            <div className="split-results">
              {Array.from({ length: splitWays }).map((_, i) => (
                <div key={i} className="split-card">
                  <div>
                    <h5>Share {i + 1} of {splitWays}</h5>
                    <p>{(total / splitWays).toFixed(2)}</p>
                  </div>
                  <button className="split-print-btn" onClick={() => onPrintSplit(i + 1, splitWays)}>Print Share</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {splitTab === 'items' && (
          <div className="split-items-list">
            {items.map((item) => (
              <div key={item.id} className="split-item-row">
                <div className="split-item-info">
                  <h5>{item.name}</h5>
                  <p>{item.qty}x &bull; {(item.price * item.qty).toFixed(2)}</p>
                </div>
                <div className="split-assignment">
                  <button className={`split-assign-btn ${itemAssignments[item.id] === 'A' ? 'active' : ''}`} onClick={() => onAssignItem(item.id, 'A')}>Bill A</button>
                  <button className={`split-assign-btn ${itemAssignments[item.id] === 'B' ? 'active' : ''}`} onClick={() => onAssignItem(item.id, 'B')}>Bill B</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`
        .modal-tabs { display: flex; border-bottom: 2px solid var(--color-border); margin-bottom: 1rem; }
        .modal-tab { flex: 1; padding: 0.6rem; text-align: center; font-weight: 700; color: var(--color-text-muted); border-bottom: 3px solid transparent; background: none; border: none; cursor: pointer; }
        .modal-tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
        .split-ways-selector { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; font-weight: 700; }
        .split-ways-selector input { width: 60px; padding: 0.45rem; border-radius: 6px; border: 1px solid var(--color-border); text-align: center; font-weight: 700; }
        .split-results { display: flex; flex-direction: column; gap: 0.5rem; max-height: 200px; overflow-y: auto; }
        .split-card { background: var(--color-bg); padding: 0.85rem 1.25rem; border-radius: 10px; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
        .split-card h5 { font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted); margin: 0; }
        .split-card p { font-size: 1.1rem; font-weight: 800; color: var(--color-primary); margin: 0.15rem 0 0 0; }
        .split-print-btn { background: var(--color-primary); color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; }
        .split-items-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 300px; overflow-y: auto; }
        .split-item-row { background: var(--color-bg); padding: 0.85rem 1rem; border-radius: 10px; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
        .split-item-info h5 { font-size: 0.85rem; font-weight: 700; color: var(--color-primary); margin: 0; }
        .split-item-info p { font-size: 0.75rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; }
        .split-assignment { display: flex; gap: 0.35rem; }
        .split-assign-btn { padding: 0.35rem 0.65rem; border-radius: 6px; border: 1px solid var(--color-border); background: white; font-weight: 700; font-size: 0.75rem; color: var(--color-text-muted); cursor: pointer; }
        .split-assign-btn.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
      `}</style>
    </ModalOverlay>
  );
}

export function EditItemModal({ item, qty, loadingAction, onClose, onSetQty, onDelete, onSave }) {
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title={`Edit Quantity: ${item?.name || ''}`} onClose={onClose} />
      <div className="modal-form">
        <div className="form-group" style={{ alignItems: 'center', margin: '1rem 0' }}>
          <p style={{ fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Adjust Quantity</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <button type="button" onClick={() => onSetQty(Math.max(0, qty - 1))} style={{ width: '40px', height: '40px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'white', fontWeight: 700, fontSize: '1.25rem', cursor: 'pointer' }}>-</button>
            <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{qty}</span>
            <button type="button" onClick={() => onSetQty(qty + 1)} style={{ width: '40px', height: '40px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="button" className="delete-btn" onClick={onDelete} disabled={loadingAction}>
            Delete Item
          </button>
          <button type="button" className="save-btn" onClick={onSave} disabled={loadingAction}>
            Save Changes
          </button>
        </div>
      </div>
      <style>{`
        .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .delete-btn { flex: 1; background: #d9534f; color: white; border: none; padding: 0.95rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
        .save-btn { flex: 1; background: var(--color-primary); color: white; border: none; padding: 0.95rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
        .delete-btn:disabled, .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </ModalOverlay>
  );
}

export function VoidBillModal({ voidReason, loadingAction, onClose, onSetReason, onConfirm }) {
  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Void Bill" onClose={onClose} />
      <div className="modal-form">
        <div className="form-group">
          <label>Reason for Voiding</label>
          <textarea
            value={voidReason}
            onChange={(e) => onSetReason(e.target.value)}
            placeholder="Enter reason for voiding this bill..."
            rows={3}
            style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--color-border)', fontSize: '0.9rem', fontWeight: 600, resize: 'vertical' }}
          />
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="void-btn" onClick={onConfirm} disabled={!voidReason.trim() || loadingAction}>
            Void Bill
          </button>
        </div>
      </div>
      <style>{`
        .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-group label { font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); }
        .cancel-btn { flex: 1; background: var(--color-bg); border: 1px solid var(--color-border); padding: 0.95rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
        .void-btn { flex: 1; background: #d9534f; color: white; border: none; padding: 0.95rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
        .void-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </ModalOverlay>
  );
}

export function ReprintBillModal({ session, onClose }) {
  if (!session) return null;

  return (
    <ModalOverlay onClose={onClose} width="480px">
      <ModalHeader title={`Bill Reprint - Table ${session.restaurant_tables?.table_number || '—'}`} onClose={onClose} />
      <div style={{ padding: '1.5rem' }}>
        <div className="reprint-paper">
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary)', margin: 0 }}>Spice OS</h4>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0 }}>123 Downtown St, Metro</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--color-border)', borderBottom: '1px dashed var(--color-border)', padding: '0.5rem 0', marginBottom: '0.75rem' }}>
            <div><p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: 0 }}>Customer</p><strong style={{ fontSize: '0.75rem' }}>{session.customer_name || 'Walk-in'}</strong></div>
            <div><p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: 0 }}>Date</p><strong style={{ fontSize: '0.75rem' }}>{session.ended_at ? new Date(session.ended_at).toLocaleDateString() : '—'}</strong></div>
            <div><p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: 0 }}>Bill #</p><strong style={{ fontSize: '0.75rem' }}>{session.id?.slice(0, 4).toUpperCase()}</strong></div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Status: <strong style={{ color: session.session_status === 'completed' ? '#2e7d32' : '#d9534f' }}>{session.session_status?.toUpperCase()}</strong>
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '1rem' }}>
            This is a reprinted copy of the original bill.
          </p>
        </div>
        <button className="close-reprint-btn" onClick={onClose}>Close</button>
      </div>
      <style>{`
        .reprint-paper { background: white; border-radius: 10px; padding: 1rem; border: 1px solid var(--color-border); }
        .close-reprint-btn { width: 100%; margin-top: 0.75rem; background: var(--color-primary); color: white; border: none; padding: 0.85rem; border-radius: 10px; font-weight: 800; font-size: 0.95rem; cursor: pointer; }
      `}</style>
    </ModalOverlay>
  );
}
