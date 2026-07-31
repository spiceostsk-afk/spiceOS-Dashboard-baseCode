import React from 'react';
import { Printer } from 'lucide-react';

const ORDERS = [
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

        {ORDERS.map((o) => (
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
              {o.actions === 'live' ? (
                <>
                  <button className="btn btn--danger btn--sm">Reject</button>
                  <button className="btn btn--primary btn--sm">Ready</button>
                </>
              ) : (
                <button className="btn btn--ghost btn--sm"><Printer size={13} /> Print</button>
              )}
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
      `}</style>
    </div>
  );
}
