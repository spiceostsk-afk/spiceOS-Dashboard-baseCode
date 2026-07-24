import React, { useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const CHART_BAR_COLORS = [
  '#D62828',
  '#E23744',
  '#F26671',
  '#F5A3A3',
];

const CHART_MAX_HEIGHT_PCT = 80;
const DAILY_TREND_DAYS = 7;

function SectionRevenueBars({ data }) {
  if (!data || data.length === 0) {
    return <p className="no-data">No sales data available yet.</p>;
  }

  const maxVal = Math.max(...data.map((s) => s.value), 1);

  return (
    <div className="bars-chart">
      {data.map((sec, idx) => {
        const percent = (sec.value / maxVal) * CHART_MAX_HEIGHT_PCT;
        return (
          <div key={idx} className="chart-bar-wrapper">
            <div className="bar-value">{FORMAT_CURRENCY.format(sec.value)}</div>
            <div
              className="chart-bar"
              style={{
                height: `${percent}%`,
                backgroundColor: CHART_BAR_COLORS[idx % CHART_BAR_COLORS.length],
              }}
            />
            <div className="bar-label">{sec.name}</div>
          </div>
        );
      })}
    </div>
  );
}

function SectionRevenueList({ data }) {
  if (!data || data.length === 0) {
    return <p className="no-data">No sales data available yet.</p>;
  }

  const total = data.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th>Section Name</th>
          <th>Gross Revenue</th>
          <th>Share Percentage</th>
        </tr>
      </thead>
      <tbody>
        {data.map((sec, idx) => {
          const share = ((sec.value / total) * 100).toFixed(1);
          return (
            <tr key={idx}>
              <td><strong>{sec.name}</strong></td>
              <td>{FORMAT_CURRENCY.format(sec.value)}</td>
              <td>
                <div className="progress-bar-wrapper">
                  <span className="share-percent">{share}%</span>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${share}%`,
                        backgroundColor: CHART_BAR_COLORS[idx % CHART_BAR_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DailyTrendBars({ data }) {
  if (!data || data.length === 0) {
    return <p className="no-data">No daily trend data available yet.</p>;
  }

  const hasSales = data.some((d) => d.total > 0);
  if (!hasSales) {
    return <p className="no-data">No sales in the last {DAILY_TREND_DAYS} days.</p>;
  }

  const maxVal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="daily-bars-chart">
      {data.map((d) => {
        const percent = (d.total / maxVal) * CHART_MAX_HEIGHT_PCT;
        return (
          <div key={d.key} className="daily-bar-wrapper">
            <div className="bar-value">
              {d.total > 0 ? FORMAT_CURRENCY.format(d.total) : ''}
            </div>
            <div
              className="daily-bar"
              style={{ height: `${Math.max(percent, 2)}%` }}
            />
            <div className="bar-label">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function SalesChart({ sectionRevenue, dailyTrend }) {
  const [activeTab, setActiveTab] = useState('section');
  const [chartView, setChartView] = useState('Graph');

  return (
    <div className="chart-panel">
      <div className="panel-header">
        <div className="panel-tabs">
          <button
            className={`tab-btn ${activeTab === 'section' ? 'active' : ''}`}
            onClick={() => setActiveTab('section')}
          >
            <BarChart3 size={16} /> Section Revenue
          </button>
          <button
            className={`tab-btn ${activeTab === 'trend' ? 'active' : ''}`}
            onClick={() => setActiveTab('trend')}
          >
            <TrendingUp size={16} /> Daily Trend
          </button>
        </div>
        {activeTab === 'section' && (
          <div className="view-toggle">
            <button
              className={chartView === 'Graph' ? 'active' : ''}
              onClick={() => setChartView('Graph')}
            >
              Graph
            </button>
            <button
              className={chartView === 'List' ? 'active' : ''}
              onClick={() => setChartView('List')}
            >
              List
            </button>
          </div>
        )}
      </div>

      <div className="panel-content">
        {activeTab === 'section' ? (
          chartView === 'Graph' ? (
            <SectionRevenueBars data={sectionRevenue} />
          ) : (
            <SectionRevenueList data={sectionRevenue} />
          )
        ) : (
          <DailyTrendBars data={dailyTrend} />
        )}
      </div>

      <style>{`
        .chart-panel {
          background: white;
          border: 1px solid var(--color-border);
          border-radius: 20px;
          padding: 1.5rem;
          box-shadow: var(--shadow-soft);
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 1rem;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .panel-tabs {
          display: flex;
          gap: 0.5rem;
        }
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--color-text-muted);
          border: 1px solid var(--color-border);
          background: var(--color-bg);
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .tab-btn.active {
          background: var(--color-primary);
          color: white;
          border-color: var(--color-primary);
        }
        .view-toggle {
          display: flex;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--color-bg);
        }
        .view-toggle button {
          padding: 0.45rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--color-text-muted);
          cursor: pointer;
        }
        .view-toggle button.active {
          background: var(--color-primary);
          color: white;
        }
        .panel-content {
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bars-chart {
          display: flex;
          align-items: flex-end;
          justify-content: space-around;
          width: 100%;
          max-width: 600px;
          height: 260px;
          padding-top: 2rem;
          border-bottom: 2px solid var(--color-border);
        }
        .chart-bar-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 80px;
          height: 100%;
          justify-content: flex-end;
        }
        .bar-value {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-primary);
          margin-bottom: 0.5rem;
          white-space: nowrap;
        }
        .chart-bar {
          width: 44px;
          border-radius: 8px 8px 0 0;
          transition: height 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }
        .bar-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-muted);
          margin-top: 0.75rem;
          white-space: nowrap;
        }
        .daily-bars-chart {
          display: flex;
          align-items: flex-end;
          justify-content: space-around;
          width: 100%;
          max-width: 500px;
          height: 260px;
          padding-top: 2rem;
          border-bottom: 2px solid var(--color-border);
        }
        .daily-bar-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 50px;
          height: 100%;
          justify-content: flex-end;
        }
        .daily-bar {
          width: 32px;
          border-radius: 6px 6px 0 0;
          background: var(--color-accent);
          transition: height 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }
        .no-data {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          font-weight: 600;
        }
        .stats-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .stats-table th {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--color-text-muted);
          padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--color-border);
          text-transform: uppercase;
        }
        .stats-table td {
          font-size: 0.9rem;
          padding: 1rem;
          border-bottom: 1px solid var(--color-border);
          color: var(--color-text);
        }
        .progress-bar-wrapper {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .share-percent {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--color-primary);
          min-width: 40px;
        }
        .progress-bar-bg {
          flex: 1;
          height: 8px;
          background: var(--color-border);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
