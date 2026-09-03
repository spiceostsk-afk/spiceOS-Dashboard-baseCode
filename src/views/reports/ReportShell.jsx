import React, { useMemo, useState } from 'react';
import { Calendar, Download, ChevronUp, ChevronDown, BarChart3 } from 'lucide-react';
import { REPORT_PERIODS, isoDay } from '../../hooks/useSalesReports';

/**
 * The frame every report shares: a period selector, headline figures, a
 * sortable table and a CSV export.
 *
 * It exists so the five reports cannot drift apart. If each screen carried its
 * own date logic, two reports over the same dates would eventually disagree,
 * and the one thing a report has to be is trustworthy.
 */

export const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
export const num = (n) => new Intl.NumberFormat('en-IN').format(Number(n) || 0);

const dayLabel = (d) => new Date(d).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
});

/* ------------------------------------------------------------ period picker */
export function ReportPeriod({ period, setPeriod, customRange, setCustomRange, range }) {
  const maxDay = isoDay(new Date());
  const label = dayLabel(range.from) === dayLabel(range.to)
    ? dayLabel(range.from)
    : `${dayLabel(range.from)} – ${dayLabel(range.to)}`;

  return (
    <div className="card rp">
      <div className="segmented rp__seg">
        {REPORT_PERIODS.map((p) => (
          <button
            key={p.key}
            className={period === p.key ? 'on' : ''}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="rp__custom">
          <label>
            <span>From</span>
            <input
              type="date" value={customRange.from} max={maxDay}
              onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date" value={customRange.to} max={maxDay}
              onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="rp__label"><Calendar size={13} /> {label}</div>

      <style>{`
        .rp { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .rp__seg { flex-wrap: wrap; }
        .rp__custom { display: flex; gap: 10px; }
        .rp__custom label {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 600; color: var(--color-text-muted);
        }
        .rp__custom input {
          height: 34px; padding: 0 9px; font: inherit; font-size: 13px;
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          background: var(--color-surface); color: var(--color-text);
        }
        .rp__label {
          margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; font-weight: 600; color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}

/* ---------------------------------------------------------------- stat row */
export function ReportStats({ cards, loading }) {
  return (
    <div className="rs">
      {cards.map((c) => (
        <div key={c.label} className="metric-card">
          <div className="metric-card__label">{c.label}</div>
          <div className="metric-card__value metric-card__value--sm" style={{ color: c.tone }}>
            {loading ? '—' : c.value}
          </div>
        </div>
      ))}
      <style>{`
        .rs {
          display: grid; gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------ sortable table */
/**
 * columns: [{ key, label, align, render, sortable, total }]
 * A column marked `total` gets summed into a footer row, because the first
 * thing anyone does with a report is check it adds up.
 */
export function ReportTable({
  columns, rows, loading, empty, onRowClick, initialSort, filename,
}) {
  const [sort, setSort] = useState(initialSort || { key: columns[0].key, dir: 'asc' });

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const f = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key]; const bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string' && Number.isNaN(Number(av))) return av.localeCompare(bv) * f;
      return ((Number(av) || 0) - (Number(bv) || 0)) * f;
    });
  }, [rows, sort]);

  const sortBy = (key) => setSort((p) => (p.key === key
    ? { key, dir: p.dir === 'desc' ? 'asc' : 'desc' }
    : { key, dir: 'desc' }));

  const totals = useMemo(() => {
    const t = {};
    columns.filter((c) => c.total).forEach((c) => {
      t[c.key] = rows.reduce((sum, r) => sum + (Number(r[c.key]) || 0), 0);
    });
    return t;
  }, [rows, columns]);

  const exportCsv = () => {
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = columns.map((c) => c.label).join(',');
    const body = sorted.map((r) => columns.map((c) => esc(r[c.key])).join(','));
    const url = URL.createObjectURL(
      new Blob([[head, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename || 'report'}-${isoDay(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="table-card rt-card">
      <div className="rt-bar">
        <span className="card__subtitle">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
        <button className="btn btn--ghost btn--sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="rt-scroll">
        <table className="rt">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.align === 'right' ? 'r' : ''} ${sort.key === c.key ? 'on' : ''}`}
                  onClick={() => sortBy(c.key)}
                >
                  <span className="rt__th">
                    {c.label}
                    <span className="rt__arrow">
                      {sort.key === c.key
                        ? (sort.dir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)
                        : <ChevronDown size={12} />}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length} className="rt-msg">Loading…</td></tr>
            )}

            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="rt-msg">
                  <span className="empty-state__mark"><BarChart3 size={20} /></span>
                  <div className="empty-state__title">{empty?.title || 'Nothing in this period'}</div>
                  <div className="empty-state__sub">{empty?.sub}</div>
                </td>
              </tr>
            )}

            {!loading && sorted.map((r, i) => (
              <tr
                key={r.id || i}
                className={onRowClick ? 'rt-click' : ''}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'r' : ''}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}

            {!loading && sorted.length > 0 && Object.keys(totals).length > 0 && (
              <tr className="rt-total">
                {columns.map((c, i) => (
                  <td key={c.key} className={c.align === 'right' ? 'r' : ''}>
                    {i === 0 ? 'Total' : (c.total ? (c.money ? money(totals[c.key]) : num(totals[c.key])) : '')}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .rt-card { padding: 0; overflow: hidden; }
        .rt-bar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--color-border);
        }
        .rt-scroll { overflow-x: auto; }
        .rt { width: 100%; border-collapse: collapse; font-size: 13px; }
        .rt th {
          position: sticky; top: 0; z-index: 1; background: var(--color-well, #F6F7F9);
          padding: 11px 16px; text-align: left; white-space: nowrap; cursor: pointer;
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.03em; color: var(--color-text-muted);
          border-bottom: 1px solid var(--color-border); user-select: none;
        }
        .rt th.r, .rt td.r { text-align: right; }
        .rt th.on { color: var(--color-info, #2563EB); }
        .rt__th { display: inline-flex; align-items: center; gap: 4px; }
        .rt__arrow { display: flex; opacity: 0; }
        .rt th:hover .rt__arrow { opacity: 0.5; }
        .rt th.on .rt__arrow { opacity: 1; }
        .rt td {
          padding: 11px 16px; border-bottom: 1px solid var(--color-border-soft);
          font-variant-numeric: tabular-nums; color: var(--color-text-soft);
        }
        .rt tbody tr:hover td { background: #FAFBFC; }
        .rt-click { cursor: pointer; }
        .rt-total td {
          font-weight: 800; color: var(--color-text);
          background: var(--color-well, #F6F7F9); border-bottom: none;
        }
        .rt-msg { text-align: center !important; padding: 44px 20px !important; }
        .rt-msg .empty-state__mark { margin: 0 auto 10px; }
        .rt-msg .empty-state__sub { margin: 0 auto; }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------- page wrapper */
export function ReportPage({ title, subtitle, periodProps, cards, loading, error, children }) {
  return (
    <div className="page">
      <div>
        <h2 className="rt-title">{title}</h2>
        {subtitle && <div className="card__subtitle">{subtitle}</div>}
      </div>

      <ReportPeriod {...periodProps} />

      {error && <div className="mst-note bad">{error}</div>}
      {cards && <ReportStats cards={cards} loading={loading} />}

      {children}

      <style>{`.rt-title { font-size: 20px; font-weight: 800; margin: 0; }`}</style>
    </div>
  );
}
