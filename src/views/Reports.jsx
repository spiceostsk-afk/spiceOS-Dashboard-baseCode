import React from 'react';
import { DollarSign, Receipt, TrendingUp, Utensils, RefreshCw, Download, Calendar } from 'lucide-react';
import { useReportsData } from '../hooks/useReportsData';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

function SummaryRow({ totalSales, totalOrders, avgOrderValue, taxCollected, formatCurrency }) {
  const items = [
    { icon: DollarSign, label: 'Total Sales', value: formatCurrency(totalSales), color: '#2E7D32' },
    { icon: Receipt, label: 'Total Orders', value: totalOrders, color: '#1565C0' },
    { icon: TrendingUp, label: 'Average Order', value: formatCurrency(avgOrderValue), color: '#E65100' },
    { icon: Receipt, label: 'Tax Collected', value: formatCurrency(taxCollected), color: '#6A1B9A' },
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
        .summary-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.25rem; margin-bottom: 1.5rem; }
        .summary-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; padding: 1.25rem; display: flex; align-items: center; gap: 1rem; }
        .summary-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .summary-label { font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; margin: 0; }
        .summary-value { font-size: 1.35rem; font-weight: 800; color: var(--color-primary); margin: 0.1rem 0 0 0; }
      `}</style>
    </div>
  );
}

function FilterBar({ period, onChange, onRefresh, onExport, loading }) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <Calendar size={16} />
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`filter-btn ${period === p.key ? 'active' : ''}`}
            onClick={() => onChange(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="filter-actions">
        <button className="print-btn" onClick={onExport}>
          <Download size={16} /> Export CSV
        </button>
        <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>
      <style>{`
        .filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem; }
        .filter-group { display: flex; align-items: center; gap: 0.5rem; background: white; border: 1px solid var(--color-border); border-radius: 10px; padding: 0.3rem; }
        .filter-group svg { margin-left: 0.5rem; color: var(--color-text-muted); }
        .filter-btn { padding: 0.4rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); background: transparent; border: none; cursor: pointer; }
        .filter-btn.active { background: var(--color-primary); color: white; }
        .filter-actions { display: flex; gap: 0.5rem; }
        .print-btn, .refresh-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .print-btn:hover, .refresh-btn:hover { background: var(--color-sidebar); }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function DailySalesChart({ dailyBreakdown, formatCurrency }) {
  if (!dailyBreakdown || dailyBreakdown.length === 0) {
    return (
      <div className="section-card">
        <h3 className="section-title">Daily Sales Breakdown</h3>
        <p className="empty-note">No sales data for this period.</p>
        <style>{`
          .section-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; padding: 1.5rem; }
          .section-title { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0 0 0.75rem 0; }
          .empty-note { text-align: center; padding: 2rem; color: var(--color-text-muted); font-style: italic; font-size: 0.85rem; margin: 0; }
        `}</style>
      </div>
    );
  }

  const maxTotal = Math.max(...dailyBreakdown.map((d) => d.total), 1);

  return (
    <div className="section-card">
      <h3 className="section-title">Daily Sales Breakdown</h3>
      <div className="bar-chart">
        {dailyBreakdown.map((day) => (
          <div key={day.key} className="bar-row">
            <span className="bar-label">{day.label}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: (day.total / maxTotal) * 100 + '%' }}
              />
            </div>
            <span className="bar-value">{formatCurrency(day.total)}</span>
          </div>
        ))}
      </div>
      <style>{`
        .section-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; padding: 1.5rem; }
        .section-title { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0 0 1rem 0; }
        .bar-chart { display: flex; flex-direction: column; gap: 0.75rem; }
        .bar-row { display: flex; align-items: center; gap: 0.75rem; }
        .bar-label { width: 90px; font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); flex-shrink: 0; }
        .bar-track { flex: 1; height: 10px; background: var(--color-bg); border-radius: 5px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--color-accent); border-radius: 5px; transition: width 0.3s; min-width: 2px; }
        .bar-value { width: 100px; text-align: right; font-size: 0.8rem; font-weight: 700; color: var(--color-primary); flex-shrink: 0; }
      `}</style>
    </div>
  );
}

function TopItemsTable({ topItems, formatCurrency }) {
  if (!topItems || topItems.length === 0) {
    return (
      <div className="section-card">
        <h3 className="section-title">Top Selling Items</h3>
        <p className="empty-note">No items sold in this period.</p>
        <style>{`
          .section-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; padding: 1.5rem; }
          .section-title { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0 0 0.75rem 0; }
          .empty-note { text-align: center; padding: 2rem; color: var(--color-text-muted); font-style: italic; font-size: 0.85rem; margin: 0; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="section-card">
      <h3 className="section-title"><Utensils size={18} /> Top Selling Items</h3>
      <div className="items-table">
        <div className="items-header">
          <span className="col-rank">#</span>
          <span className="col-name">Item</span>
          <span className="col-qty">Qty Sold</span>
          <span className="col-rev">Revenue</span>
        </div>
        {topItems.map((item, i) => (
          <div key={item.name} className="items-row">
            <span className="col-rank">{i + 1}</span>
            <span className="col-name">{item.name}</span>
            <span className="col-qty">{item.qty}</span>
            <span className="col-rev">{formatCurrency(item.revenue)}</span>
          </div>
        ))}
      </div>
      <style>{`
        .section-card { background: white; border: 1px solid var(--color-border); border-radius: 14px; padding: 1.5rem; }
        .section-title { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem; }
        .items-table { display: flex; flex-direction: column; }
        .items-header, .items-row { display: flex; align-items: center; padding: 0.7rem 0; border-bottom: 1px solid var(--color-bg); font-size: 0.85rem; }
        .items-header { font-weight: 800; font-size: 0.7rem; color: var(--color-text-muted); text-transform: uppercase; border-bottom: 2px solid var(--color-border); }
        .items-row:last-child { border-bottom: none; }
        .col-rank { width: 30px; font-weight: 800; color: var(--color-accent); }
        .col-name { flex: 1; font-weight: 600; color: var(--color-primary); }
        .col-qty { width: 80px; text-align: center; font-weight: 600; color: var(--color-text-muted); }
        .col-rev { width: 100px; text-align: right; font-weight: 700; color: var(--color-primary); }
        .items-header .col-rank, .items-header .col-qty { color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}

export default function Reports() {
  const {
    summary, topItems, dailyBreakdown,
    loading, error, period, setPeriod, refetch, formatCurrency,
  } = useReportsData();

  const handleExport = () => {
    let csv = 'Report,,,,\n';
    csv += `Total Sales,${summary.totalSales},Total Orders,${summary.totalOrders},,\n`;
    csv += `Average Order,${summary.avgOrderValue},Tax Collected,${summary.taxCollected},,\n\n`;

    csv += 'Daily Breakdown,,\n';
    csv += 'Day,Total,\n';
    for (const d of dailyBreakdown || []) {
      csv += `${d.label},${d.total},\n`;
    }
    csv += '\n';

    csv += 'Top Items,,\n';
    csv += 'Rank,Item,Qty,Revenue\n';
    for (let i = 0; i < (topItems || []).length; i++) {
      const item = topItems[i];
      csv += `${i + 1},${item.name},${item.qty},${item.revenue}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && summary.totalOrders === 0) {
    return (
      <div className="loading-state">
        <RefreshCw className="spinner" size={24} /> Loading reports...
        <style>{`
          .loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; height: 100%; font-weight: 700; color: var(--color-text-muted); }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error && summary.totalOrders === 0) {
    return (
      <div className="error-state">
        <p>Failed to load reports: {error}</p>
        <button className="retry-btn" onClick={refetch}>Retry</button>
        <style>{`
          .error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; height: 100%; color: var(--color-text-muted); font-weight: 600; }
          .retry-btn { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="reports-view">
      <div className="page-header">
        <div>
          <h2>Sales Reports</h2>
          <p className="page-subtitle">
            {summary.totalOrders} order{summary.totalOrders !== 1 ? 's' : ''} in selected period
          </p>
        </div>
      </div>

      <SummaryRow {...summary} formatCurrency={formatCurrency} />
      <FilterBar period={period} onChange={setPeriod} onRefresh={refetch} onExport={handleExport} loading={loading} />

      <div className="reports-grid">
        <DailySalesChart dailyBreakdown={dailyBreakdown} formatCurrency={formatCurrency} />
        <TopItemsTable topItems={topItems} formatCurrency={formatCurrency} />
      </div>

      <style>{`
        .reports-view { padding: 1.5rem 2rem; }
        .page-header { margin-bottom: 1.5rem; }
        .page-header h2 { font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin: 0; }
        .page-subtitle { font-size: 0.85rem; color: var(--color-text-muted); margin: 0.15rem 0 0 0; font-weight: 600; }
        .reports-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

        @media print {
          .filter-bar { display: none !important; }
          .reports-view { padding: 0; }
          .page-header { margin-bottom: 1rem; }
          .summary-row { break-inside: avoid; }
          .reports-grid { break-inside: avoid; }
          .summary-card { border: 2px solid var(--color-border); }
        }
      `}</style>
    </div>
  );
}
