import React from 'react';
import { Wallet, X, RefreshCw } from 'lucide-react';
import { usePaymentsData } from '../hooks/usePaymentsData';
import { fmtDateTime, fmtTime } from '../lib/dates';

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

function PaymentDetailModal({ payment, formatCurrency, onClose }) {
  if (!payment) return null;

  const rows = [
    ['Bill ID', `#${payment.id?.slice(0, 8).toUpperCase()}`],
    ['Table', `T-${payment.table_number}`],
    ['Customer', payment.customer_name || 'Walk-in'],
    ['Guests', payment.guest_count || '—'],
    ['Settled at', fmtDateTime(payment.ended_at)],
    ['Orders', payment.order_count],
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">Payment details</div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="pay-detail-grid">
          {rows.map(([label, value]) => (
            <div key={label}>
              <div className="drawer__label" style={{ marginBottom: 4 }}>{label}</div>
              <div className="pay-detail-value">{value}</div>
            </div>
          ))}
        </div>

        <div className="pay-detail-total">
          <span>Total amount</span>
          <span className="pay-detail-amount tnum">{formatCurrency(payment.total_amount)}</span>
        </div>

        <style>{`
          .pay-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
          .pay-detail-value { font-size: 14px; font-weight: 600; color: var(--color-text); }
          .pay-detail-total {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-top: 20px;
            padding-top: 14px;
            border-top: 1px solid var(--color-border);
            font-size: 14px;
            font-weight: 600;
            color: var(--color-text-muted);
          }
          .pay-detail-amount { font-size: 24px; font-weight: 800; color: var(--color-text); }
        `}</style>
      </div>
    </div>
  );
}

export default function Payments() {
  const {
    payments, loading, error, dateRange, setDateRange,
    selectedPayment, setSelectedPayment, summary, refetch, formatCurrency,
  } = usePaymentsData();

  if (error && payments.length === 0) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">Couldn’t load payments</div>
            <div className="empty-state__sub">{error}</div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={refetch}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const metrics = [
    { label: 'Total collections', value: formatCurrency(summary.totalCollections) },
    { label: 'Transactions', value: summary.count },
    { label: 'Average per bill', value: formatCurrency(summary.average) },
  ];

  return (
    <div className="page">
      <div className="metric-grid metric-grid--3">
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-card__label">{m.label}</div>
            <div className="metric-card__value">{loading && payments.length === 0 ? '—' : m.value}</div>
          </div>
        ))}
      </div>

      <div className="pay-filters">
        <div className="segmented">
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              className={dateRange === r.key ? 'on' : ''}
              onClick={() => setDateRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn btn--ghost" onClick={refetch} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="table-card table-card--padded">
        <div className="table-toolbar">
          <div className="card__title" style={{ flex: 1 }}>Settled bills</div>
          <div className="card__subtitle">
            {payments.length} payment{payments.length === 1 ? '' : 's'} in this period
          </div>
        </div>

        <div className="table-head">
          <div className="pc-time">Time</div>
          <div className="pc-bill">Bill no.</div>
          <div className="pc-table">Table</div>
          <div className="pc-cust">Customer</div>
          <div className="pc-orders">Orders</div>
          <div className="pc-amt">Amount</div>
          <div className="pc-action" />
        </div>

        {loading && payments.length === 0 && (
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading payments…</div>
          </div>
        )}

        {!loading && payments.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Wallet size={22} /></span>
            <div className="empty-state__title">No payments found</div>
            <div className="empty-state__sub">No settled bills for the selected period.</div>
          </div>
        )}

        {payments.map((p) => (
          <div
            key={p.id}
            className="table-row table-row--clickable"
            onClick={() => setSelectedPayment(p)}
          >
            <div className="pc-time muted tnum">{fmtTime(p.ended_at)}</div>
            <div className="pc-bill strong">#{p.id?.slice(0, 6).toUpperCase()}</div>
            <div className="pc-table">T-{p.table_number}</div>
            <div className="pc-cust muted">{p.customer_name || 'Walk-in'}</div>
            <div className="pc-orders muted tnum">{p.order_count}</div>
            <div className="pc-amt amount">{formatCurrency(p.total_amount)}</div>
            <div className="pc-action">
              <span className="link-action">View</span>
            </div>
          </div>
        ))}
      </div>

      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          formatCurrency={formatCurrency}
          onClose={() => setSelectedPayment(null)}
        />
      )}

      <style>{`
        .pay-filters { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

        .pc-time { width: 80px; }
        .pc-bill { width: 100px; }
        .pc-table { width: 70px; }
        .pc-cust { flex: 1; min-width: 0; }
        .pc-orders { width: 70px; text-align: right; }
        .pc-amt { width: 110px; text-align: right; }
        .pc-action { width: 60px; text-align: right; }
      `}</style>
    </div>
  );
}
