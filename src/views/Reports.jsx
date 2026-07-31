import React from 'react';
import { RefreshCw, Download, Utensils } from 'lucide-react';
import { useReportsData } from '../hooks/useReportsData';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

function SalesTrend({ dailyBreakdown, formatCurrency }) {
  if (!dailyBreakdown || dailyBreakdown.length === 0) {
    return (
      <div className="card">
        <div className="card__title">Sales trend</div>
        <div className="empty-state">
          <div className="empty-state__sub">No sales data for this period.</div>
        </div>
      </div>
    );
  }

  const max = Math.max(...dailyBreakdown.map((d) => d.total), 1);
  const peak = dailyBreakdown.reduce(
    (best, d, i) => (d.total > dailyBreakdown[best].total ? i : best),
    0,
  );
  const hasSales = dailyBreakdown.some((d) => d.total > 0);
  const total = dailyBreakdown.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="card chart-card">
      <div className="card__title">Sales trend</div>
      <div className="card__subtitle">Total {formatCurrency(total)} across this period</div>

      <div className="bars">
        {dailyBreakdown.map((d, i) => {
          const hot = hasSales && i === peak;
          return (
            <div
              key={d.key}
              className={`bars__col ${hot ? 'hot' : ''}`}
              title={`${d.label} · ${formatCurrency(d.total)}`}
            >
              <div
                className={`bars__bar ${hot ? 'hot' : ''}`}
                style={{ height: `${Math.round((d.total / max) * 100)}%` }}
              />
              <div className="bars__label">{d.label}</div>
            </div>
          );
        })}
      </div>

      <style>{`.chart-card { display: flex; flex-direction: column; }`}</style>
    </div>
  );
}

function TopItems({ topItems, formatCurrency }) {
  if (!topItems || topItems.length === 0) {
    return (
      <div className="card">
        <div className="card__title">Top selling items</div>
        <div className="empty-state">
          <span className="empty-state__mark"><Utensils size={22} /></span>
          <div className="empty-state__sub">No items sold in this period.</div>
        </div>
      </div>
    );
  }

  const max = Math.max(...topItems.map((i) => i.revenue), 1);

  return (
    <div className="card">
      <div className="card__title">Top selling items</div>
      <div className="card__subtitle" style={{ marginBottom: 8 }}>By revenue</div>

      {topItems.map((item, i) => (
        <div key={item.name} className="ti-row">
          <div className="ti-head">
            <span className="ti-rank">{i + 1}</span>
            <span className="ti-name">{item.name}</span>
            <span className="ti-qty">{item.qty} sold</span>
            <span className="ti-rev tnum">{formatCurrency(item.revenue)}</span>
          </div>
          <div className="meter meter--sm">
            <div className="meter__fill" style={{ width: `${(item.revenue / max) * 100}%` }} />
          </div>
        </div>
      ))}

      <style>{`
        .ti-row {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 11px 0;
          border-bottom: 1px solid var(--color-border-soft);
        }
        .ti-row:last-child { border-bottom: none; }
        .ti-head { display: flex; align-items: center; gap: 12px; font-size: 14px; }
        .ti-rank { width: 20px; color: var(--color-text-faint); font-weight: 600; font-size: 13px; }
        .ti-name {
          flex: 1;
          min-width: 0;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ti-qty { font-size: 12px; color: var(--color-text-muted); white-space: nowrap; }
        .ti-rev { font-weight: 700; white-space: nowrap; }
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

  if (error && summary.totalOrders === 0) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">Couldn’t load reports</div>
            <div className="empty-state__sub">{error}</div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={refetch}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const metrics = [
    { label: 'Total sales', value: formatCurrency(summary.totalSales) },
    { label: 'Orders', value: summary.totalOrders },
    { label: 'Average order', value: formatCurrency(summary.avgOrderValue) },
    { label: 'Tax collected', value: formatCurrency(summary.taxCollected) },
  ];

  const isEmpty = loading && summary.totalOrders === 0;

  return (
    <div className="page reports">
      <div className="rep-bar">
        <div className="segmented">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={period === p.key ? 'on' : ''}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn btn--ghost" onClick={handleExport}>
          <Download size={14} /> Export CSV
        </button>
        <button className="btn btn--ghost" onClick={refetch} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="metric-grid metric-grid--4">
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-card__label">{m.label}</div>
            <div className="metric-card__value">{isEmpty ? '—' : m.value}</div>
          </div>
        ))}
      </div>

      <div className="rep-grid">
        <SalesTrend dailyBreakdown={dailyBreakdown} formatCurrency={formatCurrency} />
        <TopItems topItems={topItems} formatCurrency={formatCurrency} />
      </div>

      <style>{`
        .rep-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .rep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }

        @media (max-width: 1000px) {
          .rep-grid { grid-template-columns: 1fr; }
        }

        @media print {
          .rep-bar { display: none !important; }
          .reports { padding: 0; }
          .metric-grid, .rep-grid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
