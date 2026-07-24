import React from 'react';
import { Wallet, Banknote, CreditCard, Calendar, DollarSign, Receipt, X, RefreshCw, Search } from 'lucide-react';
import { usePaymentsData } from '../hooks/usePaymentsData';

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

function SummaryRow({ totalCollections, count, average, formatCurrency }) {
  const items = [
    { icon: DollarSign, label: 'Total Collections', value: formatCurrency(totalCollections), color: '#2E7D32' },
    { icon: Receipt, label: 'Total Transactions', value: count, color: '#1565C0' },
    { icon: Banknote, label: 'Average Per Bill', value: formatCurrency(average), color: '#E65100' },
  ];

  return (
    <div className="summary-row">
      {items.map((item) => (
        <div key={item.label} className="summary-card">
          <div className="summary-icon" style={{ background: item.color + '15', color: item.color }}>
            <item.icon size={22} />
          </div>
          <div>
            <p className="summary-label">{item.label}</p>
            <p className="summary-value">{item.value}</p>
          </div>
        </div>
      ))}
      <style>{`
        .summary-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 1.5rem; }
        .summary-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; padding: 1.25rem; display: flex; align-items: center; gap: 1rem; }
        .summary-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .summary-label { font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; margin: 0; }
        .summary-value { font-size: 1.35rem; font-weight: 800; color: var(--color-primary); margin: 0.1rem 0 0 0; }
      `}</style>
    </div>
  );
}

function FilterBar({ dateRange, onChange, onRefresh, loading }) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <Calendar size={16} />
        {DATE_RANGES.map((r) => (
          <button
            key={r.key}
            className={`filter-btn ${dateRange === r.key ? 'active' : ''}`}
            onClick={() => onChange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
        <RefreshCw size={16} className={loading ? 'spin' : ''} />
        Refresh
      </button>
      <style>{`
        .filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
        .filter-group { display: flex; align-items: center; gap: 0.5rem; background: white; border: 1px solid var(--color-border); border-radius: 10px; padding: 0.3rem; }
        .filter-group svg { margin-left: 0.5rem; color: var(--color-text-muted); }
        .filter-btn { padding: 0.4rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); background: transparent; border: none; cursor: pointer; }
        .filter-btn.active { background: var(--color-primary); color: white; }
        .refresh-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function PaymentTable({ payments, onSelect, formatCurrency }) {
  if (payments.length === 0) {
    return (
      <div className="empty-state">
        <Wallet size={40} strokeWidth={1} />
        <h4>No payments found</h4>
        <p>No settled bills for the selected period.</p>
        <style>{`
          .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; color: var(--color-text-muted); gap: 0.5rem; }
          .empty-state h4 { font-weight: 700; color: var(--color-primary); margin: 0; }
          .empty-state p { font-size: 0.85rem; margin: 0; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="payment-table">
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Table</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="payment-row" onClick={() => onSelect(p)}>
              <td className="cell-date">
                {p.ended_at ? new Date(p.ended_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                <span className="cell-time">
                  {p.ended_at ? new Date(p.ended_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </td>
              <td>T-{p.table_number}</td>
              <td>{p.customer_name || 'Walk-in'}</td>
              <td>{p.order_count}</td>
              <td className="cell-amount">{formatCurrency(p.total_amount)}</td>
              <td><button className="view-btn">View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`
        .table-container { background: white; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; }
        .payment-table { width: 100%; border-collapse: collapse; }
        .payment-table th { text-align: left; padding: 1rem 1.25rem; font-size: 0.75rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase; border-bottom: 1px solid var(--color-border); background: var(--color-bg); }
        .payment-table td { padding: 1rem 1.25rem; font-size: 0.9rem; font-weight: 600; color: var(--color-primary); border-bottom: 1px solid var(--color-border); }
        .payment-row { cursor: pointer; transition: var(--transition-smooth); }
        .payment-row:hover { background: var(--color-sidebar); }
        .cell-date { display: flex; flex-direction: column; }
        .cell-time { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); }
        .cell-amount { font-weight: 800; }
        .view-btn { padding: 0.3rem 0.75rem; background: var(--color-sidebar); border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: var(--color-primary); cursor: pointer; }
      `}</style>
    </div>
  );
}

function PaymentDetailModal({ payment, formatCurrency, onClose }) {
  if (!payment) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Payment Details</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Bill ID</span>
              <span className="detail-value">#{payment.id?.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Table</span>
              <span className="detail-value">T-{payment.table_number}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Customer</span>
              <span className="detail-value">{payment.customer_name || 'Walk-in'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Guests</span>
              <span className="detail-value">{payment.guest_count || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Settled At</span>
              <span className="detail-value">
                {payment.ended_at ? new Date(payment.ended_at).toLocaleString('en-IN') : '—'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Orders</span>
              <span className="detail-value">{payment.order_count}</span>
            </div>
          </div>
          <div className="detail-total">
            <span>Total Amount</span>
            <span className="total-value">{formatCurrency(payment.total_amount)}</span>
          </div>
        </div>
        <style>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: white; width: 480px; border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-soft); border: 1px solid var(--color-border); }
          .modal-header { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
          .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .close-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
          .modal-body { padding: 1.5rem; }
          .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
          .detail-item { display: flex; flex-direction: column; gap: 0.15rem; }
          .detail-label { font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; }
          .detail-value { font-size: 0.95rem; font-weight: 700; color: var(--color-primary); }
          .detail-total { display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 2px solid var(--color-border); font-size: 1rem; font-weight: 700; color: var(--color-text-muted); }
          .total-value { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); }
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

  if (loading && payments.length === 0) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" size={24} /> Loading payments...
        <style>{`
          .loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; height: 100%; font-weight: 700; color: var(--color-text-muted); }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error && payments.length === 0) {
    return (
      <div className="error-state">
        <p>Failed to load payments: {error}</p>
        <button className="retry-btn" onClick={refetch}>Retry</button>
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); font-weight: 600; }
          .retry-btn { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="payments-view">
      <div className="page-header">
        <h2>Payments</h2>
        <p className="page-subtitle">{payments.length} payment{payments.length !== 1 ? 's' : ''} in selected period</p>
      </div>

      <SummaryRow {...summary} formatCurrency={formatCurrency} />
      <FilterBar dateRange={dateRange} onChange={setDateRange} onRefresh={refetch} loading={loading} />
      <PaymentTable payments={payments} onSelect={setSelectedPayment} formatCurrency={formatCurrency} />

      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          formatCurrency={formatCurrency}
          onClose={() => setSelectedPayment(null)}
        />
      )}

      <style>{`
        .payments-view { padding: 1.5rem 2rem; }
        .page-header { margin-bottom: 1.5rem; }
        .page-header h2 { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .page-subtitle { font-size: 0.85rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; font-weight: 600; }
      `}</style>
    </div>
  );
}
