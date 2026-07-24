import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';

const STATUS_LABELS = {
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  preparing: 'PREPARING',
  ready: 'READY',
  out_for_delivery: 'ON THE WAY',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
};

const STATUS_COLORS = {
  pending: '#f59e0b',
  accepted: '#3b82f6',
  preparing: '#f97316',
  ready: '#22c55e',
  out_for_delivery: '#3b82f6',
  delivered: '#16a34a',
  cancelled: '#ef4444',
};

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function OrderRow({ order }) {
  const statusKey = order.status || 'pending';
  const label = STATUS_LABELS[statusKey] || statusKey.toUpperCase();
  const color = STATUS_COLORS[statusKey] || '#6b7280';

  return (
    <div className="order-row">
      <div className="order-info">
        <div className="order-id-row">
          <span className="order-id">#{String(order.id).slice(0, 8)}</span>
          {order.tableNumber && (
            <span className="order-table">T-{order.tableNumber}</span>
          )}
        </div>
        <div className="order-time">
          <Clock size={12} />
          <span>{formatTime(order.createdAt)}</span>
        </div>
      </div>
      <div className="order-right">
        <span className="order-total">{FORMAT_CURRENCY.format(order.total)}</span>
        <span className="order-status" style={{ backgroundColor: `${color}18`, color }}>
          {label}
        </span>
      </div>
      <style>{`
        .order-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 0;
          border-bottom: 1px solid var(--color-border);
        }
        .order-row:last-child {
          border-bottom: none;
        }
        .order-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .order-id-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .order-id {
          font-weight: 700;
          font-size: 0.85rem;
          color: var(--color-primary);
        }
        .order-table {
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--color-text-muted);
          background: var(--color-bg);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .order-time {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.75rem;
          color: var(--color-text-muted);
        }
        .order-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.35rem;
        }
        .order-total {
          font-weight: 800;
          font-size: 0.9rem;
          color: var(--color-primary);
        }
        .order-status {
          font-size: 0.65rem;
          font-weight: 800;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}

export default function RecentActivity({ orders, loading }) {
  if (loading) {
    return (
      <div className="panel">
        <div className="panel-title">
          <Clock size={16} /> Recent Orders
        </div>
        <div className="loading-state">
          <RefreshCw size={18} className="spinner" />
          <span>Loading recent orders...</span>
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
          <Clock size={16} /> Recent Orders
        </div>
        <p className="empty-state">No recent orders found.</p>
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
        <Clock size={16} /> Recent Orders
      </div>
      <div className="orders-list">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
      <style>{`
        .panel { background: white; border: 1px solid var(--color-border); border-radius: 20px; padding: 1.5rem; box-shadow: var(--shadow-soft); }
        .panel-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); }
        .orders-list { display: flex; flex-direction: column; }
      `}</style>
    </div>
  );
}
