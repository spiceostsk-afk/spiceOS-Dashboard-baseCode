import React, { useState } from 'react';
import { Plus, X, Truck, Pencil, Trash2 } from 'lucide-react';
import { usePurchaseData } from '../../hooks/usePurchaseData';

/** The suppliers behind purchase invoices. */

const EMPTY = { name: '', phone: '', email: '', gstin: '', address: '' };

function VendorModal({ vendor, onClose, onSave }) {
  const [draft, setDraft] = useState(vendor || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await onSave(draft);
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error || 'Could not save the vendor.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">{vendor ? 'Edit vendor' : 'Add vendor'}</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="vn-error">{error}</div>}

          <div className="field">
            <label>Vendor name</label>
            <input value={draft.name} onChange={set('name')} placeholder="e.g. Sharma Traders" required autoFocus />
          </div>

          <div className="field-grid">
            <div className="field">
              <label>Phone</label>
              <input value={draft.phone || ''} onChange={set('phone')} placeholder="Optional" />
            </div>
            <div className="field">
              <label>GSTIN</label>
              <input value={draft.gstin || ''} onChange={set('gstin')} placeholder="Optional" />
            </div>
            <div className="field span-2">
              <label>Email</label>
              <input type="email" value={draft.email || ''} onChange={set('email')} placeholder="Optional" />
            </div>
            <div className="field span-2">
              <label>Address</label>
              <textarea rows={2} value={draft.address || ''} onChange={set('address')} placeholder="Optional" />
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : vendor ? 'Save changes' : 'Add vendor'}
          </button>
        </div>

        <style>{`
          .vn-error {
            padding: 12px 14px; border-radius: var(--radius-md);
            background: var(--color-danger-soft); color: var(--color-danger);
            font-size: 13px; font-weight: 600;
          }
        `}</style>
      </form>
    </div>
  );
}

export default function Vendors() {
  const { vendors, purchases, loading, saveVendor, removeVendor } = usePurchaseData();
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  /** Spend per vendor, so the list is ranked by who actually matters. */
  const spend = purchases.reduce((acc, p) => {
    if (p.status !== 'posted' || !p.vendors?.id) return acc;
    acc[p.vendors.id] = (acc[p.vendors.id] || 0) + (Number(p.total) || 0);
    return acc;
  }, {});

  const handleRemove = (v) => {
    if (!window.confirm(`Remove ${v.name}? Past invoices stay on record.`)) return;
    removeVendor(v.id);
  };

  return (
    <div className="page">
      <div className="vn-top">
        <div>
          <h2 className="vn-title">Vendors</h2>
          <div className="card__subtitle">{vendors.length} active supplier{vendors.length === 1 ? '' : 's'}</div>
        </div>
        <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add vendor
        </button>
      </div>

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="vc-name">Vendor</div>
          <div className="vc-phone">Phone</div>
          <div className="vc-gst">GSTIN</div>
          <div className="vc-spend">Total spend</div>
          <div className="vc-act" />
        </div>

        {loading && <div className="empty-state">Loading vendors…</div>}

        {!loading && vendors.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Truck size={22} /></span>
            <div className="empty-state__title">No vendors yet</div>
            <div className="empty-state__sub">
              Add the suppliers you buy from and every purchase invoice can be traced back
              to one of them.
            </div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>
              <Plus size={15} /> Add vendor
            </button>
          </div>
        )}

        {!loading && vendors.map((v) => (
          <div key={v.id} className="table-row vn-row">
            <div className="vc-name">
              <div className="strong">{v.name}</div>
              {v.address && <div className="vn-addr">{v.address}</div>}
            </div>
            <div className="vc-phone muted">{v.phone || '—'}</div>
            <div className="vc-gst muted">{v.gstin || '—'}</div>
            <div className="vc-spend amount">₹{(spend[v.id] || 0).toFixed(2)}</div>
            <div className="vc-act">
              <button className="mini" onClick={() => setEditing(v)} title="Edit"><Pencil size={13} /></button>
              <button className="mini mini--danger" onClick={() => handleRemove(v)} title="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <VendorModal onClose={() => setShowAdd(false)} onSave={saveVendor} />
      )}
      {editing && (
        <VendorModal vendor={editing} onClose={() => setEditing(null)} onSave={saveVendor} />
      )}

      <style>{`
        .vn-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .vn-title { font-size: 20px; font-weight: 800; margin: 0; }
        .vn-row { margin: 0 -24px; padding: 0 24px; }
        .vn-addr { font-size: 11.5px; color: var(--color-text-muted); }
        .vc-name { flex: 1.5; min-width: 0; }
        .vc-phone { width: 140px; }
        .vc-gst { width: 170px; }
        .vc-spend { width: 130px; text-align: right; }
        .vc-act { width: 76px; display: flex; justify-content: flex-end; gap: 6px; }

        .mini {
          width: 28px; height: 28px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface); color: var(--color-text-muted);
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .mini:hover { background: var(--color-canvas); color: var(--color-text); }
        .mini--danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }
      `}</style>
    </div>
  );
}
