import React, { useState } from 'react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const DATASETS = [
  { key: 'section', label: 'By section' },
  { key: 'daily', label: 'Last 7 days' },
];

const VIEWS = [
  { key: 'graph', label: 'Graph' },
  { key: 'list', label: 'List' },
];

const fmt = (v) => FORMAT_CURRENCY.format(v);

/** Normalise both datasets to { label, value } so one renderer serves both. */
function seriesFor(dataset, sectionRevenue, dailyTrend) {
  if (dataset === 'section') {
    return (sectionRevenue || []).map((s) => ({ label: s.name, value: s.value }));
  }
  return (dailyTrend || []).map((d) => ({ label: d.label, value: d.total }));
}

function Bars({ series }) {
  const max = Math.max(...series.map((s) => s.value), 1);
  const peak = series.reduce((best, s, i) => (s.value > series[best].value ? i : best), 0);
  const hasSales = series.some((s) => s.value > 0);

  return (
    <div className="bars">
      {series.map((s, i) => {
        const hot = hasSales && i === peak;
        return (
          <div
            key={`${s.label}-${i}`}
            className={`bars__col ${hot ? 'hot' : ''}`}
            title={`${s.label} · ${fmt(s.value)}`}
          >
            <div
              className={`bars__bar ${hot ? 'hot' : ''}`}
              style={{ height: `${Math.round((s.value / max) * 100)}%` }}
            />
            <div className="bars__label">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function List({ series }) {
  const max = Math.max(...series.map((s) => s.value), 1);
  const total = series.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="chart-list">
      {series.map((s, i) => (
        <div key={`${s.label}-${i}`} className="chart-list__row">
          <div className="chart-list__head">
            <span className="chart-list__name">{s.label}</span>
            <span className="chart-list__share">{((s.value / total) * 100).toFixed(1)}%</span>
            <span className="chart-list__amt tnum">{fmt(s.value)}</span>
          </div>
          <div className="meter">
            <div className="meter__fill" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SalesChart({ sectionRevenue, dailyTrend }) {
  const [dataset, setDataset] = useState('section');
  const [view, setView] = useState('graph');

  const series = seriesFor(dataset, sectionRevenue, dailyTrend);
  const total = series.reduce((sum, s) => sum + s.value, 0);

  const subtitle = dataset === 'section'
    ? `Across ${series.length} section${series.length === 1 ? '' : 's'} · total ${fmt(total)}`
    : `Last 7 days · total ${fmt(total)}`;

  return (
    <div className="card chart-card">
      <div className="card__head">
        <div style={{ flex: 1 }}>
          <div className="card__title">Revenue</div>
          <div className="card__subtitle">{subtitle}</div>
        </div>
        <div className="segmented">
          {DATASETS.map((d) => (
            <button
              key={d.key}
              className={dataset === d.key ? 'on' : ''}
              onClick={() => setDataset(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="segmented">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={view === v.key ? 'on' : ''}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {series.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__title">No sales data yet</div>
          <div className="empty-state__sub">
            Revenue appears here once orders start coming through.
          </div>
        </div>
      ) : view === 'graph' ? (
        <Bars series={series} />
      ) : (
        <List series={series} />
      )}

      <style>{`
        .chart-card { display: flex; flex-direction: column; }

        .chart-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-top: 16px;
        }

        .chart-list__row { display: flex; flex-direction: column; gap: 6px; }

        .chart-list__head {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
        }

        .chart-list__name { flex: 1; font-weight: 600; min-width: 0; }
        .chart-list__share { color: var(--color-text-muted); font-size: 12px; }
        .chart-list__amt { font-weight: 700; }
      `}</style>
    </div>
  );
}
