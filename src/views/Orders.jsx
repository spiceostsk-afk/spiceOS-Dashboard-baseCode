import React from 'react';
import { ClipboardList, Search, X, RefreshCw, Printer, Calendar } from 'lucide-react';
import { useOrdersData } from '../hooks/useOrdersData';

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

function OrderDetailModal({ order, formatCurrency, onClose, onPrintKot }) {
  if (!order) return null;
  const allItems = order.orders.flatMap((o) =>
    (o.order_items || []).map((oi) => ({
      ...oi,
      orderStatus: o.order_status,
      itemName: oi.menu_items?.item_name || 'Unknown Item',
    }))
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Order #{order.billId}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Table</span>
              <span className="detail-value">T-{order.tableNumber}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Customer</span>
              <span className="detail-value">{order.customerName}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Guests</span>
              <span className="detail-value">{order.guests || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Status</span>
              <span className={`status-badge ${order.status}`}>{order.status}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Started</span>
              <span className="detail-value">{order.startedAt ? new Date(order.startedAt).toLocaleString('en-IN') : '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Completed</span>
              <span className="detail-value">{order.endedAt ? new Date(order.endedAt).toLocaleString('en-IN') : '—'}</span>
            </div>
          </div>

          <div className="items-section">
            <h4>Items ({allItems.length})</h4>
            <div className="items-list">
              {allItems.map((item, idx) => (
                <div key={idx} className="item-row">
                  <div className="item-info">
                    <span className="item-name">{item.itemName}</span>
                    <span className="item-qty">x{item.quantity}</span>
                  </div>
                  <span className="item-price">{formatCurrency(item.total_price || item.item_price * item.quantity || 0)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="detail-total">
            <span>Total Amount</span>
            <span className="total-value">{formatCurrency(order.totalAmount)}</span>
          </div>

          <button className="print-kot-btn" onClick={() => onPrintKot(order)}>
            <Printer size={16} /> Reprint KOT
          </button>
        </div>
        <style>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: white; width: 560px; max-height: 85vh; overflow-y: auto; border-radius: 20px; box-shadow: var(--shadow-soft); border: 1px solid var(--color-border); }
          .modal-header { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
          .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .close-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
          .modal-body { padding: 1.5rem; }
          .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
          .detail-item { display: flex; flex-direction: column; gap: 0.15rem; }
          .detail-label { font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; }
          .detail-value { font-size: 0.95rem; font-weight: 700; color: var(--color-primary); }
          .status-badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; text-transform: capitalize; }
          .status-badge.completed { background: #E8F5E9; color: #2E7D32; }
          .status-badge.void { background: #FFEBEE; color: #C62828; }
          .items-section { margin-top: 1.5rem; border-top: 1px solid var(--color-border); padding-top: 1rem; }
          .items-section h4 { font-size: 0.9rem; font-weight: 700; color: var(--color-primary); margin: 0 0 0.75rem 0; }
          .items-list { display: flex; flex-direction: column; }
          .item-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--color-bg); }
          .item-row:last-child { border-bottom: none; }
          .item-info { display: flex; align-items: center; gap: 0.5rem; }
          .item-name { font-size: 0.85rem; font-weight: 600; color: var(--color-primary); }
          .item-qty { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; }
          .item-price { font-size: 0.85rem; font-weight: 700; color: var(--color-primary); }
          .detail-total { display: flex; justify-content: space-between; align-items: center; margin-top: 1.25rem; padding-top: 1rem; border-top: 2px solid var(--color-border); font-size: 1rem; font-weight: 700; color: var(--color-text-muted); }
          .total-value { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); }
          .print-kot-btn { width: 100%; margin-top: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem; padding: 0.65rem; background: var(--color-accent-soft); color: var(--color-primary); border: 1px solid var(--color-border); border-radius: 8px; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
          .print-kot-btn:hover { background: var(--color-accent); }
        `}</style>
      </div>
    </div>
  );
}

export default function Orders() {
  const {
    orders, loading, error, search, setSearch,
    statusFilter, setStatusFilter, dateRange, setDateRange,
    selectedOrder, setSelectedOrder, refetch, formatCurrency,
    STATUS_FILTERS, handlePrintKot,
  } = useOrdersData();

  if (loading && orders.length === 0) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" size={24} /> Loading order history...
        <style>{`
          .loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; height: 100%; font-weight: 700; color: var(--color-text-muted); }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="error-state">
        <p>Failed to load orders: {error}</p>
        <button className="retry-btn" onClick={refetch}>Retry</button>
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); font-weight: 600; }
          .retry-btn { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="orders-view">
      <div className="page-header">
        <div>
          <h2>Order History</h2>
          <p className="page-subtitle">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="refresh-btn" onClick={refetch} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="filters-row">
        <div className="search-bar">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by bill ID, table, customer, item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-tab ${statusFilter === f ? 'active' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="date-filter">
          <Calendar size={16} />
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              className={`date-btn ${dateRange === r.key ? 'active' : ''}`}
              onClick={() => setDateRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={40} strokeWidth={1} />
          <h4>No orders found</h4>
          <p>No completed or void orders match your filters.</p>
          <style>{`
            .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; color: var(--color-text-muted); gap: 0.5rem; }
            .empty-state h4 { font-weight: 700; color: var(--color-primary); margin: 0; }
            .empty-state p { font-size: 0.85rem; margin: 0; }
          `}</style>
        </div>
      ) : (
        <div className="table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Table</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="order-row" onClick={() => setSelectedOrder(o)}>
                  <td className="cell-billid">#{o.billId}</td>
                  <td>T-{o.tableNumber}</td>
                  <td>{o.customerName}</td>
                  <td>{o.itemCount}</td>
                  <td className="cell-amount">{formatCurrency(o.totalAmount)}</td>
                  <td><span className={`status-badge ${o.status}`}>{o.status}</span></td>
                  <td className="cell-date">
                    {o.endedAt ? new Date(o.endedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                  <td><button className="view-btn">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          formatCurrency={formatCurrency}
          onClose={() => setSelectedOrder(null)}
          onPrintKot={handlePrintKot}
        />
      )}

      <style>{`
        .orders-view { padding: 1.5rem 2rem; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .page-header h2 { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .page-subtitle { font-size: 0.85rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; font-weight: 600; }
        .refresh-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .filters-row { display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center; }
        .search-bar { display: flex; align-items: center; gap: 0.5rem; background: white; border: 1px solid var(--color-border); padding: 0.6rem 1rem; border-radius: 10px; flex: 1; min-width: 220px; }
        .search-bar input { border: none; background: transparent; outline: none; width: 100%; font-size: 0.85rem; color: var(--color-primary); }
        .search-bar svg { color: var(--color-text-muted); flex-shrink: 0; }
        .filter-tabs { display: flex; background: white; border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; }
        .filter-tab { padding: 0.45rem 0.85rem; font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); border: none; background: white; cursor: pointer; }
        .filter-tab.active { background: var(--color-primary); color: white; }
        .filter-tab:not(:last-child) { border-right: 1px solid var(--color-border); }
        .date-filter { display: flex; align-items: center; gap: 0.25rem; background: white; border: 1px solid var(--color-border); border-radius: 10px; padding: 0.3rem; }
        .date-filter svg { margin-left: 0.35rem; color: var(--color-text-muted); }
        .date-btn { padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); border: none; background: transparent; cursor: pointer; }
        .date-btn.active { background: var(--color-primary); color: white; }
        .table-container { background: white; border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; }
        .orders-table { width: 100%; border-collapse: collapse; }
        .orders-table th { text-align: left; padding: 1rem 1.25rem; font-size: 0.75rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase; border-bottom: 1px solid var(--color-border); background: var(--color-bg); }
        .orders-table td { padding: 1rem 1.25rem; font-size: 0.9rem; font-weight: 600; color: var(--color-primary); border-bottom: 1px solid var(--color-border); }
        .order-row { cursor: pointer; transition: var(--transition-smooth); }
        .order-row:hover { background: var(--color-sidebar); }
        .cell-billid { font-weight: 800; font-family: monospace; }
        .cell-amount { font-weight: 800; }
        .cell-date { font-size: 0.85rem; color: var(--color-text-muted); }
        .status-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; text-transform: capitalize; }
        .status-badge.completed { background: #E8F5E9; color: #2E7D32; }
        .status-badge.void { background: #FFEBEE; color: #C62828; }
        .view-btn { padding: 0.3rem 0.75rem; background: var(--color-sidebar); border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: var(--color-primary); cursor: pointer; }
      `}</style>
    </div>
  );
}
