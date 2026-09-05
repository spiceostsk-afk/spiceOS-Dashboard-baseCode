import React, { useMemo, useState } from 'react';
import {
  Download, Search, RefreshCw, BarChart3, ChevronUp, ChevronDown,
} from 'lucide-react';
import SearchSelect from '../../components/SearchSelect';
import { useStockSummary } from '../../hooks/useStockSummary';
import { useOutlet } from '../../context/OutletContext';
import MovementDetailDrawer from './MovementDetailDrawer';

/**
 * Stock Summary — the eleven columns the client asked for, over a date range.
 *
 * Reading across a row answers the only question that matters at close:
 *
 *   opening + purchase + transfer in − consumption − transfer out − wastage
 *     = what should be there (ideal)
 *   what was actually counted            = physical
 *   the gap, with someone's explanation  = variance + remark
 *
 * The table scrolls horizontally rather than shrinking: these are numbers to
 * be compared, and a column squeezed to three characters cannot be.
 */

const fmt = (n) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, '');
};

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

/**
 * A figure that can be opened.
 *
 * A zero still opens — "why is consumption zero" is as fair a question as
 * "what made up 114.75", and the answer ("nothing was recorded") is worth
 * being able to see rather than infer.
 */
function Cell({ v, cls = '', onOpen }) {
  return (
    <td className={cls}>
      <button className="ss-cell" onClick={onOpen}>{fmt(v)}</button>
    </td>
  );
}

export default function StockSummary() {
  const {
    rows, categories, filters, totals, loading, error,
    setFilter, search, clear, exportCsv,
  } = useStockSummary();
  const { outlets, outlet, isMultiOutlet } = useOutlet();

  /**
   * Sorting.
   *
   * Every column is worth ranking by — the point of this report is finding the
   * biggest consumer, the worst variance, the heaviest wastage. First click
   * sorts largest first, because that is what someone is looking for; a second
   * click flips it.
   *
   * Nulls always sink. "Not counted" is the absence of a number, not a small
   * one, and letting it sort as zero would bury the real values.
   */
  const [sort, setSort] = useState({ key: 'item_name', dir: 'asc' });

  // The cell whose entries are open. Every figure here is a sum over the
  // ledger, so any of them can be shown as the movements that produced it.
  const [openCell, setOpenCell] = useState(null);

  const openDetail = (row, column) => setOpenCell({
    itemId: row.inventory_item_id,
    itemName: row.item_name,
    unit: row.unit,
    column,
  });

  const sortBy = (key) => setSort((prev) => (
    prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: key === 'item_name' || key === 'category_name' ? 'asc' : 'desc' }
  ));

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;

      if (typeof av === 'string' && Number.isNaN(Number(av))) {
        return av.localeCompare(bv) * factor;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * factor;
    });
  }, [rows, sort]);

  /** A header that says how it is sorted and can be clicked to change it. */
  const Th = ({ col, label, sub, className = '' }) => {
    const on = sort.key === col;
    return (
      <th
        className={`${className} ss-th ${on ? 'on' : ''}`}
        onClick={() => sortBy(col)}
        title={`Sort by ${label}`}
      >
        <span className="ss-th__in">
          <span>
            {label}{sub && <><br /><span>{sub}</span></>}
          </span>
          <span className="ss-th__arrow">
            {on
              ? (sort.dir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />)
              : <ChevronDown size={13} />}
          </span>
        </span>
      </th>
    );
  };

  const cards = [
    { label: 'Items', value: totals.items },
    { label: 'Purchased', value: fmt(totals.purchase) },
    { label: 'Consumed', value: fmt(totals.consumption) },
    { label: 'Wastage', value: fmt(totals.wastage), tone: 'var(--color-warning)' },
    { label: 'Stock value', value: money(totals.value) },
    {
      label: 'Variance value',
      value: money(totals.varianceValue),
      tone: totals.varianceValue < 0 ? 'var(--color-danger)' : 'var(--color-text)',
    },
  ];

  return (
    <div className="page">
      <div className="ss-top">
        <div>
          <h2 className="ss-title">Stock Summary Report</h2>
          <div className="card__subtitle">
            {filters.allOutlets || !isMultiOutlet
              ? (isMultiOutlet ? 'All outlets' : outlet?.name || 'All stock')
              : outlet?.name}
            {totals.counted > 0 && (
              <> · {totals.counted} counted, {totals.mismatched} with a variance</>
            )}
          </div>
        </div>
        <button className="btn btn--ghost" onClick={exportCsv} disabled={rows.length === 0}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* ---------------------------------------------------------- filters */}
      <div className="card ss-filters">
        <div className="field">
          <label>Raw material</label>
          <input
            value={filters.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Name or barcode"
          />
        </div>

        <div className="field">
          <label>Category</label>
          <SearchSelect
            value={filters.categoryId}
            onChange={(v) => setFilter({ categoryId: v })}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="All"
            allowEmpty
            emptyLabel="All"
            ariaLabel="Category"
          />
        </div>

        <div className="field">
          <label>Unit type</label>
          <select
            value={filters.unitType}
            onChange={(e) => setFilter({ unitType: e.target.value })}
          >
            <option value="base">Consumption unit</option>
            <option value="purchase">Purchase unit</option>
          </select>
        </div>

        <div className="field">
          <label>From date</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilter({ from: e.target.value })}
          />
        </div>

        <div className="field">
          <label>To date</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilter({ to: e.target.value })}
          />
        </div>

        {isMultiOutlet && (
          <div className="field">
            <label>Outlet</label>
            <select
              value={filters.allOutlets ? 'all' : 'current'}
              onChange={(e) => setFilter({ allOutlets: e.target.value === 'all' })}
            >
              <option value="current">{outlet?.name || 'Current outlet'}</option>
              <option value="all">All outlets ({outlets.length})</option>
            </select>
          </div>
        )}

        <div className="ss-filters__actions">
          <button className="btn btn--primary" onClick={() => search()} disabled={loading}>
            {loading ? <RefreshCw size={15} className="spin" /> : <Search size={15} />} Search
          </button>
          <button className="btn btn--ghost" onClick={clear}>Clear</button>
        </div>
      </div>

      {/* ------------------------------------------------------------ cards */}
      <div className="ss-cards">
        {cards.map((c) => (
          <div key={c.label} className="metric-card">
            <div className="metric-card__label">{c.label}</div>
            <div className="metric-card__value metric-card__value--sm" style={{ color: c.tone }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="ss-error">{error}</div>}

      {/* ------------------------------------------------------------ table */}
      <div className="table-card ss-card">
        <div className="ss-scroll">
          <table className="ss-table">
            <thead>
              <tr>
                <Th col="item_name" label="Raw Material" className="sticky-col" />
                <Th col="opening_stock" label="Opening" sub="Stock" />
                <Th col="purchase_stock" label="Purchase" sub="Stock" />
                <Th col="total_stock" label="Total" sub="Stock" className="grp" />
                <Th col="consumption" label="Consumption" />
                <Th col="transfer_in" label="Transfer" sub="In" />
                <Th col="transfer_out" label="Transfer" sub="Out" />
                <Th col="wastage" label="Wastage" />
                <Th col="ideal_stock" label="Ideal" sub="Stock" className="grp" />
                <Th col="physical_stock" label="Physical" sub="Stock" className="grp" />
                <Th col="variance" label="Variance" />
                <Th col="closing_stock" label="Closing" sub="Stock" className="grp" />
                <Th col="remark" label="Remark" className="ss-remark" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={13} className="ss-msg">Loading stock summary…</td></tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="ss-msg">
                    <span className="empty-state__mark"><BarChart3 size={22} /></span>
                    <div className="empty-state__title">No stock movement in this range</div>
                    <div className="empty-state__sub">
                      Widen the dates, or record a purchase or count to give the report
                      something to summarise.
                    </div>
                  </td>
                </tr>
              )}

              {!loading && sorted.map((r) => {
                const variance = r.variance === null ? null : Number(r.variance);
                return (
                  <tr key={r.inventory_item_id}>
                    <td className="sticky-col">
                      <div className="strong">{r.item_name}</div>
                      <div className="ss-sub">{r.category_name} · {r.unit}</div>
                    </td>
                    <Cell v={r.opening_stock} onOpen={() => openDetail(r, 'opening_stock')} />
                    <Cell v={r.purchase_stock} onOpen={() => openDetail(r, 'purchase_stock')} />
                    <Cell v={r.total_stock} cls="grp strong" onOpen={() => openDetail(r, 'total_stock')} />
                    <Cell v={r.consumption} onOpen={() => openDetail(r, 'consumption')} />
                    <Cell v={r.transfer_in} onOpen={() => openDetail(r, 'transfer_in')} />
                    <Cell v={r.transfer_out} onOpen={() => openDetail(r, 'transfer_out')} />
                    <Cell
                      v={r.wastage}
                      cls={Number(r.wastage) > 0 ? 'warn' : ''}
                      onOpen={() => openDetail(r, 'wastage')}
                    />
                    <Cell v={r.ideal_stock} cls="grp strong" onOpen={() => openDetail(r, 'ideal_stock')} />
                    <td className="grp strong">
                      {r.physical_stock === null
                        ? <span className="ss-uncounted">Not counted</span>
                        : (
                          <button className="ss-cell" onClick={() => openDetail(r, 'physical_stock')}>
                            {fmt(r.physical_stock)}
                          </button>
                        )}
                    </td>
                    <td>
                      {variance === null ? <span className="muted">—</span> : (
                        <button className="ss-cell" onClick={() => openDetail(r, 'variance')}>
                          {variance === 0
                            ? <span className="pill tone-green pill--sm">Match</span>
                            : (
                              <span className={`pill pill--sm ${variance > 0 ? 'tone-blue' : 'tone-red'}`}>
                                {variance > 0 ? '+' : ''}{fmt(variance)}
                              </span>
                            )}
                        </button>
                      )}
                    </td>
                    {/* What actually carries into tomorrow. Ideal deliberately
                        excludes the count correction; closing includes it, so
                        when the two differ a count is the reason. */}
                    <Cell
                      v={r.closing_stock}
                      cls="grp strong"
                      onOpen={() => openDetail(r, 'closing_stock')}
                    />
                    <td className="ss-remark">{r.remark || <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openCell && (
        <MovementDetailDrawer
          cell={openCell}
          range={{ from: filters.from, to: filters.to, allOutlets: filters.allOutlets }}
          onClose={() => setOpenCell(null)}
        />
      )}

      <style>{`
        .ss-cell {
          border: none; background: none; padding: 2px 3px; margin: -2px -3px;
          font: inherit; color: inherit; cursor: pointer; border-radius: 5px;
          font-variant-numeric: tabular-nums;
        }
        .ss-cell:hover {
          background: var(--color-info-soft, #EAF1FE);
          color: var(--color-info, #2563EB);
          box-shadow: 0 0 0 1px var(--color-info, #2563EB);
        }

        .ss-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .ss-title { font-size: 20px; font-weight: 800; margin: 0; }

        .ss-filters {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 14px;
          align-items: end;
        }
        .ss-filters__actions { display: flex; gap: 8px; }

        .ss-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }

        .ss-error {
          padding: 12px 14px; border-radius: var(--radius-md);
          background: var(--color-danger-soft); color: var(--color-danger);
          font-size: 13px; font-weight: 600;
        }

        .ss-card { padding: 0; overflow: hidden; }
        .ss-scroll { overflow-x: auto; }

        .ss-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ss-table th {
          position: sticky; top: 0; z-index: 2;
          background: var(--color-well, #F6F7F9);
          padding: 12px 14px; text-align: right; white-space: nowrap;
          font-size: 11.5px; font-weight: 700; color: var(--color-text-muted);
          text-transform: uppercase; letter-spacing: 0.03em;
          border-bottom: 1px solid var(--color-border);
        }
        .ss-table th span { font-weight: 600; opacity: 0.75; }

        .ss-th { cursor: pointer; user-select: none; }
        .ss-th:hover { color: var(--color-text); }
        .ss-th.on { color: var(--color-info, #2563EB); }
        .ss-th__in {
          display: inline-flex; align-items: center; gap: 5px;
          justify-content: flex-end; width: 100%;
        }
        .ss-th.sticky-col .ss-th__in { justify-content: flex-start; }
        .ss-th__arrow { display: flex; opacity: 0; flex-shrink: 0; }
        .ss-th:hover .ss-th__arrow { opacity: 0.55; }
        .ss-th.on .ss-th__arrow { opacity: 1; }
        .ss-table td {
          padding: 12px 14px; text-align: right; white-space: nowrap;
          border-bottom: 1px solid var(--color-border-soft);
          font-variant-numeric: tabular-nums; color: var(--color-text-soft);
        }
        .ss-table tbody tr:hover td { background: #FAFBFC; }
        .ss-table .strong { font-weight: 700; color: var(--color-text); }
        .ss-table .warn { color: var(--color-warning); font-weight: 600; }
        .ss-table .grp { background: #F7FAFD; }
        .ss-table tbody tr:hover .grp { background: #F1F6FC; }

        .sticky-col {
          position: sticky; left: 0; z-index: 1;
          text-align: left !important; min-width: 200px;
          background: var(--color-surface);
          box-shadow: 1px 0 0 var(--color-border-soft);
        }
        .ss-table th.sticky-col { z-index: 3; background: var(--color-well, #F6F7F9); }
        .ss-table tbody tr:hover .sticky-col { background: #FAFBFC; }

        .ss-sub { font-size: 11.5px; color: var(--color-text-muted); font-weight: 500; }
        .ss-uncounted { font-size: 11.5px; font-weight: 600; color: var(--color-text-faint); }
        .ss-remark { text-align: left !important; min-width: 160px; white-space: normal !important; }

        .ss-msg {
          text-align: center !important; padding: 44px 20px !important;
          color: var(--color-text-muted);
        }
        .ss-msg .empty-state__mark { margin: 0 auto 10px; }
        .ss-msg .empty-state__sub { margin: 0 auto; }

        .spin { animation: ss-spin 0.9s linear infinite; }
        @keyframes ss-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
