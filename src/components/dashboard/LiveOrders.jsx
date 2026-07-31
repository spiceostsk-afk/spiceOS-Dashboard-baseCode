import React from 'react';
import { useNavigate } from 'react-router-dom';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const STATUS_TONES = {
  pending: { label: 'Pending', tone: 'tone-neutral' },
  accepted: { label: 'Accepted', tone: 'tone-blue' },
  preparing: { label: 'Cooking', tone: 'tone-amber' },
  ready: { label: 'Ready', tone: 'tone-green' },
  out_for_delivery: { label: 'On the way', tone: 'tone-blue' },
};

const STALE_MINUTES = 45;

function minutesSince(dateStr) {
  if (!dateStr) return null;
  const diff = (Date.now() - new Date(dateStr).getTime()) / 60000;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : null;
}

export default function LiveOrders({ orders, loading }) {
  const navigate = useNavigate();

  return (
    <div className="card">
      <div className="card__head">
        <div style={{ flex: 1 }} className="card__title">Live orders</div>
        <button className="link-action" onClick={() => navigate('/billing')}>View all →</button>
      </div>

      {loading && <div className="empty-state">Loading live orders…</div>}

      {!loading && (!orders || orders.length === 0) && (
        <div className="empty-state">
          <div className="empty-state__title">No active orders</div>
          <div className="empty-state__sub">Running tables appear here while service is on.</div>
        </div>
      )}

      {!loading && orders && orders.map((order, i) => {
        const s = STATUS_TONES[order.order_status]
          || { label: order.order_status || 'Pending', tone: 'tone-neutral' };
        const min = minutesSince(order.created_at);
        const late = min !== null && min > STALE_MINUTES;
        return (
          <div key={order.id || i} className="table-row live-row">
            <div className="lo-table">
              Table {order.restaurant_tables?.table_number || '—'}
            </div>
            <div className="lo-amount muted tnum">{FORMAT_CURRENCY.format(order.total || 0)}</div>
            <div className="lo-status"><span className={`pill ${s.tone}`}>{s.label}</span></div>
            <div
              className="lo-min tnum"
              style={{ color: late ? 'var(--color-danger)' : 'var(--color-text)' }}
            >
              {min === null ? '—' : `${min} min`}
            </div>
          </div>
        );
      })}

      <style>{`
        .live-row:last-child { border-bottom: none; }
        .lo-table { width: 110px; font-weight: 700; }
        .lo-amount { flex: 1; }
        .lo-status { width: 110px; }
        .lo-min { width: 70px; text-align: right; font-weight: 600; }
      `}</style>
    </div>
  );
}
