import React from 'react';
import { fmtTime } from '../../lib/dates';

const STATUS_TONES = {
  pending: { label: 'Pending', tone: 'tone-amber' },
  accepted: { label: 'Accepted', tone: 'tone-blue' },
  preparing: { label: 'Preparing', tone: 'tone-amber' },
  ready: { label: 'Ready', tone: 'tone-green' },
  out_for_delivery: { label: 'On the way', tone: 'tone-blue' },
  delivered: { label: 'Delivered', tone: 'tone-green' },
  cancelled: { label: 'Cancelled', tone: 'tone-red' },
};

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    return fmtTime(dateStr);
  } catch {
    return '';
  }
}

export default function RecentActivity({ orders, loading }) {
  return (
    <div className="card">
      <div className="card__title">Recent activity</div>
      <div className="card__subtitle" style={{ marginBottom: 14 }}>Latest orders across the floor</div>

      {loading && <div className="empty-state">Loading activity…</div>}

      {!loading && (!orders || orders.length === 0) && (
        <div className="empty-state">
          <div className="empty-state__title">Nothing yet today</div>
          <div className="empty-state__sub">Orders show up here as they are placed.</div>
        </div>
      )}

      {!loading && orders && orders.length > 0 && (
        <div className="activity-list">
          {orders.map((order) => {
            const s = STATUS_TONES[order.status] || { label: order.status, tone: 'tone-neutral' };
            return (
              <div key={order.id} className="activity-row">
                <div className="activity-main">
                  <div className="activity-id">
                    #{String(order.id).slice(0, 8)}
                    {order.tableNumber && <span className="activity-table">Table {order.tableNumber}</span>}
                  </div>
                  <div className="activity-time">{formatTime(order.createdAt)}</div>
                </div>
                <span className={`pill ${s.tone}`}>{s.label}</span>
                <div className="activity-total tnum">{FORMAT_CURRENCY.format(order.total)}</div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .activity-list { display: flex; flex-direction: column; }

        .activity-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 0;
          border-bottom: 1px solid var(--color-border-soft);
          font-size: 13.5px;
        }

        .activity-row:last-child { border-bottom: none; }

        .activity-main { flex: 1; min-width: 0; }

        .activity-id {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: var(--color-text);
        }

        .activity-table { font-weight: 500; color: var(--color-text-muted); font-size: 12.5px; }
        .activity-time { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
        .activity-total { font-weight: 700; }
      `}</style>
    </div>
  );
}
