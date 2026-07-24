import React from 'react';
import { Printer } from 'lucide-react';

export default function OnlineOrdersTab() {
  return (
    <div className="tab-content">
      <div className="online-header-row">
        <h4>Aggregator Delivery Feed</h4>
        <div className="aggregator-pills">
          <span className="pill swiggy">Swiggy</span>
          <span className="pill zomato">Zomato</span>
        </div>
      </div>

      <table className="online-orders-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Source</th>
            <th>Customer</th>
            <th>Order Items</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>#SW-9082</td>
            <td><span className="source-tag swiggy-bg">Swiggy</span></td>
            <td><strong>Ritesh K.</strong><br />+91 908** **982</td>
            <td>2x Butter Chicken, 4x Butter Naan</td>
            <td>₹ 680.00</td>
            <td><span className="status-indicator preparing">Preparing</span></td>
            <td>
              <button className="pos-table-btn reject">Reject</button>
              <button className="pos-table-btn accept">Ready</button>
            </td>
          </tr>
          <tr>
            <td>#ZO-4521</td>
            <td><span className="source-tag zomato-bg">Zomato</span></td>
            <td><strong>Ananya S.</strong><br />+91 887** **341</td>
            <td>1x Veg Biryani, 1x Paneer Tikka</td>
            <td>₹ 410.00</td>
            <td><span className="status-indicator ready">Out for Delivery</span></td>
            <td>
              <button className="pos-table-btn print"><Printer size={12} /> Print</button>
            </td>
          </tr>
        </tbody>
      </table>

      <style>{`
        .tab-content { padding: 1.5rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1.25rem; }
        .online-header-row { display: flex; justify-content: space-between; align-items: center; }
        .online-header-row h4 { font-size: 1.05rem; font-weight: 700; color: var(--color-primary); }
        .aggregator-pills { display: flex; gap: 0.5rem; }
        .pill { font-size: 0.7rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: 6px; text-transform: uppercase; }
        .pill.swiggy { background: #FF6F00; color: white; }
        .pill.zomato { background: #CB202D; color: white; }
        .online-orders-table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; border: 1px solid var(--color-border); }
        .online-orders-table th { background: var(--color-sidebar); padding: 0.85rem 1rem; font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); text-align: left; text-transform: uppercase; }
        .online-orders-table td { padding: 1rem; font-size: 0.85rem; border-bottom: 1px solid var(--color-border); color: var(--color-text); vertical-align: middle; }
        .source-tag { font-size: 0.7rem; font-weight: 800; padding: 0.15rem 0.4rem; border-radius: 4px; }
        .swiggy-bg { background: #FFE0B2; color: #E65100; }
        .zomato-bg { background: #FFCDD2; color: #B71C1C; }
        .status-indicator { font-size: 0.7rem; font-weight: 800; padding: 0.15rem 0.4rem; border-radius: 4px; }
        .status-indicator.preparing { background: #E8F5E9; color: #2E7D32; }
        .status-indicator.ready { background: #E1F5FE; color: #0288D1; }
        .pos-table-btn { border: none; padding: 0.4rem 0.75rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; margin-right: 0.35rem; transition: var(--transition-smooth); }
        .pos-table-btn.reject { background: #FFEBEE; color: #C62828; }
        .pos-table-btn.accept { background: var(--color-primary); color: white; }
        .pos-table-btn.print { background: var(--color-accent-soft); color: var(--color-primary); }
      `}</style>
    </div>
  );
}
