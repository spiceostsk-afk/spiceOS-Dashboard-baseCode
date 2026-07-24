import React, { useState } from 'react';
import { Users, Phone, Calendar, DollarSign, X, RefreshCw, Search, User } from 'lucide-react';
import { useCustomersData } from '../hooks/useCustomersData';

function CustomerDetailModal({ customer, formatCurrency, onClose }) {
  if (!customer) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{customer.name}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Phone</span>
              <span className="detail-value">{customer.phone || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Visits</span>
              <span className="detail-value">{customer.visitCount}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Total Spent</span>
              <span className="detail-value">{formatCurrency(customer.totalSpent)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Last Visit</span>
              <span className="detail-value">
                {customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString('en-IN') : '—'}
              </span>
            </div>
          </div>
          <div className="session-history">
            <h4>Visit History ({customer.sessions.length})</h4>
            {customer.sessions.slice(0, 20).map((s) => (
              <div key={s.id} className="history-row">
                <div className="history-left">
                  <span className="history-date">{s.ended_at ? new Date(s.ended_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>
                  <span className="history-guest">{s.guest_count || '—'} guests</span>
                </div>
                <div className="history-right">
                  <span className="history-status">{s.session_status}</span>
                  <span className="history-amount">{formatCurrency(s.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <style>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: white; width: 520px; max-height: 80vh; overflow-y: auto; border-radius: 20px; box-shadow: var(--shadow-soft); border: 1px solid var(--color-border); }
          .modal-header { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
          .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .close-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
          .modal-body { padding: 1.5rem; }
          .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
          .detail-item { display: flex; flex-direction: column; gap: 0.15rem; }
          .detail-label { font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; }
          .detail-value { font-size: 0.95rem; font-weight: 700; color: var(--color-primary); }
          .session-history { margin-top: 1.5rem; border-top: 1px solid var(--color-border); padding-top: 1rem; }
          .session-history h4 { font-size: 0.9rem; font-weight: 700; color: var(--color-primary); margin: 0 0 0.75rem 0; }
          .history-row { display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--color-bg); }
          .history-row:last-child { border-bottom: none; }
          .history-left { display: flex; flex-direction: column; }
          .history-date { font-size: 0.85rem; font-weight: 700; color: var(--color-primary); }
          .history-guest { font-size: 0.75rem; color: var(--color-text-muted); }
          .history-right { display: flex; align-items: center; gap: 0.75rem; }
          .history-status { font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--color-bg); color: var(--color-text-muted); font-weight: 700; text-transform: capitalize; }
          .history-amount { font-size: 0.9rem; font-weight: 800; color: var(--color-primary); }
        `}</style>
      </div>
    </div>
  );
}

export default function Customers() {
  const { customers, loading, error, selectedCustomer, setSelectedCustomer, refetch, formatCurrency } = useCustomersData();
  const [search, setSearch] = useState('');

  const filtered = search
    ? customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)))
    : customers;

  if (loading && customers.length === 0) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" size={24} /> Loading customers...
        <style>{`
          .loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; height: 100%; font-weight: 700; color: var(--color-text-muted); }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error && customers.length === 0) {
    return (
      <div className="error-state">
        <p>Failed to load customers: {error}</p>
        <button className="retry-btn" onClick={refetch}>Retry</button>
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); font-weight: 600; }
          .retry-btn { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="customers-view">
      <div className="page-header">
        <div>
          <h2>Customers</h2>
          <p className="page-subtitle">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="refresh-btn" onClick={refetch} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="search-bar">
        <Search size={16} />
        <input type="text" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Users size={40} strokeWidth={1} />
          <h4>No customers found</h4>
          <p>Customers appear here after their first visit.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="customer-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Visits</th>
                <th>Total Spent</th>
                <th>Last Visit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.phone || i} className="customer-row">
                  <td>
                    <div className="customer-name-cell">
                      <div className="avatar-small">{c.name.charAt(0).toUpperCase()}</div>
                      <span>{c.name}</span>
                    </div>
                  </td>
                  <td>{c.phone || '—'}</td>
                  <td><span className="visit-badge">{c.visitCount}</span></td>
                  <td className="cell-amount">{formatCurrency(c.totalSpent)}</td>
                  <td className="cell-date">{c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                  <td><button className="view-btn" onClick={() => setSelectedCustomer(c)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCustomer && (
        <CustomerDetailModal customer={selectedCustomer} formatCurrency={formatCurrency} onClose={() => setSelectedCustomer(null)} />
      )}

      <style>{`
        .customers-view { padding: 1.5rem 2rem; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .page-header h2 { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .page-subtitle { font-size: 0.85rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; font-weight: 600; }
        .refresh-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .search-bar { display: flex; align-items: center; gap: 0.5rem; background: white; border: 1px solid var(--color-border); padding: 0.6rem 1rem; border-radius: 10px; margin-bottom: 1.25rem; max-width: 360px; }
        .search-bar input { border: none; background: transparent; outline: none; width: 100%; font-size: 0.85rem; color: var(--color-primary); }
        .search-bar svg { color: var(--color-text-muted); }
        .table-container { background: white; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; }
        .customer-table { width: 100%; border-collapse: collapse; }
        .customer-table th { text-align: left; padding: 1rem 1.25rem; font-size: 0.75rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase; border-bottom: 1px solid var(--color-border); background: var(--color-bg); }
        .customer-table td { padding: 1rem 1.25rem; font-size: 0.9rem; font-weight: 600; color: var(--color-primary); border-bottom: 1px solid var(--color-border); }
        .customer-row { cursor: pointer; transition: var(--transition-smooth); }
        .customer-row:hover { background: var(--color-sidebar); }
        .customer-name-cell { display: flex; align-items: center; gap: 0.65rem; }
        .avatar-small { width: 34px; height: 34px; border-radius: 50%; background: var(--color-accent-soft); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; color: var(--color-primary); }
        .visit-badge { background: var(--color-accent-soft); padding: 0.2rem 0.6rem; border-radius: 6px; font-weight: 800; font-size: 0.85rem; }
        .cell-amount { font-weight: 800; }
        .cell-date { font-size: 0.85rem; color: var(--color-text-muted); }
        .view-btn { padding: 0.3rem 0.75rem; background: var(--color-sidebar); border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: var(--color-primary); cursor: pointer; }
        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; color: var(--color-text-muted); gap: 0.5rem; }
        .empty-state h4 { font-weight: 700; color: var(--color-primary); margin: 0; }
        .empty-state p { font-size: 0.85rem; margin: 0; }
      `}</style>
    </div>
  );
}
