import React from 'react';
import { ShoppingBag, RefreshCw } from 'lucide-react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export default function LiveOrders({ orders, loading }) {
  if (loading) {
    return (
      <div className="panel">
        <div className="panel-title">
          <ShoppingBag size={16} /> Live Orders
        </div>
        <div className="loading-state">
          <RefreshCw size={18} className="spinner" />
          <span>Loading live orders...</span>
        </div>
        <style>{`
          .panel { background: white; border: 1px solid var(--color-border); border-radius: 20px; padding: 1.5rem; box-shadow: var(--shadow-soft); }
          .panel-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); }
          .loading-state { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem 0; color: var(--color-text-muted); font-size: 0.9rem; font-weight: 600; }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="panel">
        <div className="panel-title">
          <ShoppingBag size={16} /> Live Orders
        </div>
        <p className="empty-state">No active orders right now.</p>
        <style>{`
          .panel { background: white; border: 1px solid var(--color-border); border-radius: 20px; padding: 1.5rem; box-shadow: var(--shadow-soft); }
          .panel-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); }
          .empty-state { text-align: center; padding: 2rem 0; color: var(--color-text-muted); font-weight: 600; font-size: 0.9rem; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <ShoppingBag size={16} /> Live Orders
        <span className="live-badge">{orders.length}</span>
      </div>
      <div className="live-grid">
        {orders.map((order) => (
          <div key={order.id} className="live-card">
            <div className="live-card-header">
              <span className="live-table">
                T-{order.restaurant_tables?.table_number || '?'}
              </span>
              <span className="live-status">{order.order_status || 'pending'}</span>
            </div>
            <div className="live-card-total">
              {FORMAT_CURRENCY.format(order.total || 0)}
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .panel { background: white; border: 1px solid var(--color-border); border-radius: 20px; padding: 1.5rem; box-shadow: var(--shadow-soft); }
        .panel-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); }
        .live-badge { background: #ef4444; color: white; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 999px; margin-left: auto; }
        .live-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; }
        .live-card { background: var(--color-accent-soft); border-radius: 12px; padding: 1rem; border: 1px solid var(--color-border); }
        .live-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .live-table { font-weight: 800; font-size: 0.9rem; color: var(--color-primary); }
        .live-status { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; background: var(--color-primary); color: white; padding: 0.15rem 0.4rem; border-radius: 4px; }
        .live-card-total { font-size: 1.2rem; font-weight: 800; color: var(--color-primary); }
      `}</style>
    </div>
  );
}
