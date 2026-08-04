import React, { useState } from 'react';
import { Printer } from 'lucide-react';

const SEED_ORDERS = [
  {
    id: '#SW-9082',
    source: 'Swiggy',
    sourceTone: 'tone-amber',
    customer: 'Ritesh K.',
    phone: '+91 908** **982',
    items: '2× Butter Chicken, 4× Butter Naan',
    amount: '₹680.00',
    status: 'Preparing',
    statusTone: 'tone-amber',
    actions: 'live',
  },
  {
    id: '#ZO-4521',
    source: 'Zomato',
    sourceTone: 'tone-red',
    customer: 'Ananya S.',
    phone: '+91 887** **341',
    items: '1× Veg Biryani, 1× Paneer Tikka',
    amount: '₹410.00',
    status: 'Out for delivery',
    statusTone: 'tone-blue',
    actions: 'print',
  },
];

export default function OnlineOrdersTab() {
  // Aggregator webhooks aren't connected yet, so this feed is seeded locally.
  // The controls still drive real state so the flow can be walked end to end.
  const [orders, setOrders] = useState(SEED_ORDERS);

  const setStatus = (id, status, statusTone, actions) => {
    setOrders((prev) => prev.map((o) => (
      o.id === id ? { ...o, status, statusTone, actions } : o
    )));
  };

  const handleReject = (o) => {
    if (!window.confirm(`Reject ${o.id} from ${o.source}?`)) return;
    setStatus(o.id, 'Rejected', 'tone-red', 'none');
  };

  const handleReady = (o) => setStatus(o.id, 'Out for delivery', 'tone-blue', 'print');

  const handlePrint = (o) => {
    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups to print the ticket.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>${o.id}</title>
      <style>body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:12px;font-size:13px}
      h2{text-align:center;margin:0 0 2px;font-size:17px}.sub{text-align:center;font-size:11px;color:#555;margin-bottom:8px}
      hr{border:none;border-top:1px dashed #333;margin:6px 0}</style></head><body>
      <h2>${o.source.toUpperCase()}</h2><div class="sub">Online order ticket</div><hr/>
      <div><strong>Order:</strong> ${o.id}</div>
      <div><strong>Customer:</strong> ${o.customer}</div>
      <div><strong>Phone:</strong> ${o.phone}</div><hr/>
      <div>${o.items}</div><hr/>
      <div><strong>Total:</strong> ${o.amount}</div>
      <script>window.print();window.close();<\/script></body></html>`);
    win.document.close();
  };

  return (
    <div className="oo">
      <div className="oo-head">
        <div className="card__title" style={{ flex: 1 }}>Aggregator delivery feed</div>
        <span className="pill pill--sm tone-amber">Swiggy</span>
        <span className="pill pill--sm tone-red">Zomato</span>
      </div>

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="oo-c-id">Order</div>
          <div className="oo-c-source">Source</div>
          <div className="oo-c-cust">Customer</div>
          <div className="oo-c-items">Items</div>
          <div className="oo-c-amt">Amount</div>
          <div className="oo-c-status">Status</div>
          <div className="oo-c-actions">Actions</div>
        </div>

        {orders.map((o) => (
          <div key={o.id} className="table-row oo-row">
            <div className="oo-c-id strong">{o.id}</div>
            <div className="oo-c-source">
              <span className={`pill pill--sm ${o.sourceTone}`}>{o.source}</span>
            </div>
            <div className="oo-c-cust">
              <div className="strong">{o.customer}</div>
              <div className="muted oo-phone tnum">{o.phone}</div>
            </div>
            <div className="oo-c-items muted">{o.items}</div>
            <div className="oo-c-amt amount">{o.amount}</div>
            <div className="oo-c-status">
              <span className={`pill pill--sm ${o.statusTone}`}>{o.status}</span>
            </div>
            <div className="oo-c-actions">
              {o.actions === 'live' && (
                <>
                  <button className="btn btn--danger btn--sm" onClick={() => handleReject(o)}>Reject</button>
                  <button className="btn btn--primary btn--sm" onClick={() => handleReady(o)}>Ready</button>
                </>
              )}
              {o.actions === 'print' && (
                <button className="btn btn--ghost btn--sm" onClick={() => handlePrint(o)}>
                  <Printer size={13} /> Print
                </button>
              )}
              {o.actions === 'none' && <span className="oo-done">No action</span>}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .oo { display: flex; flex-direction: column; gap: 14px; }
        .oo-head { display: flex; align-items: center; gap: 8px; }

        .oo-row { height: auto; padding: 12px 0; }

        .oo-c-id { width: 90px; }
        .oo-c-source { width: 90px; }
        .oo-c-cust { width: 140px; min-width: 0; }
        .oo-c-items { flex: 1; min-width: 0; }
        .oo-c-amt { width: 90px; text-align: right; }
        .oo-c-status { width: 130px; }
        .oo-c-actions { width: 150px; display: flex; gap: 8px; justify-content: flex-end; }

        .oo-phone { font-size: 12px; }
        .oo-done { font-size: 12.5px; color: var(--color-text-faint); }
      `}</style>
    </div>
  );
}
