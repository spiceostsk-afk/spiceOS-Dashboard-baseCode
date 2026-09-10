import React from 'react';
import { X, ArrowRight } from 'lucide-react';
import {
  useMovementDetail, COLUMN_MOVEMENTS, movementLabel, movementTone,
} from '../../hooks/useMovementDetail';
import { fmtDateTime } from '../../lib/dates';

/**
 * What is behind one figure on the Stock Summary.
 *
 * Every number in that report is a sum over the ledger, so it can always be
 * shown as the entries that produced it — the purchases, the orders that ate
 * it, the wastage written off. A figure a manager cannot open is one they have
 * to take on trust.
 *
 * Movements are signed in the ledger, so this shows the sign rather than the
 * magnitude the report column displays: −13 is stock that left, +25 arrived.
 */

const fmt = (n) => {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, '');
};


const DOC_LABEL = {
  purchases: 'Purchase',
  stock_wastage: 'Wastage entry',
  stock_transfers: 'Transfer',
  stock_counts: 'Stock count',
  order_items: 'Order',
};

export default function MovementDetailDrawer({ cell, range, onClose }) {
  const { rows, loading, error, net, inTotal, outTotal } = useMovementDetail(cell, range);
  if (!cell) return null;

  const spec = COLUMN_MOVEMENTS[cell.column] || {};

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer drawer--wide md">
        <div className="md__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card__title">{cell.itemName}</div>
            <div className="card__subtitle">
              {spec.label || cell.column}
              {' · '}
              {spec.before
                ? `everything before ${range.from}`
                : `${range.from} to ${range.to}`}
            </div>
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="md__totals">
          <div><span>In</span><strong className="pos">+{fmt(inTotal)}</strong></div>
          <div><span>Out</span><strong className="neg">−{fmt(outTotal)}</strong></div>
          <div><span>Net</span><strong>{net > 0 ? '+' : ''}{fmt(net)} {cell.unit}</strong></div>
          <div><span>Entries</span><strong>{rows.length}</strong></div>
        </div>

        {error && <div className="mst-note bad">{error}</div>}
        {loading && <div className="empty-state">Loading entries…</div>}

        {!loading && rows.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__title">Nothing behind this figure</div>
            <div className="empty-state__sub">
              No movement of this kind was recorded for {cell.itemName} in this period —
              which is why the column reads zero.
            </div>
          </div>
        )}

        {!loading && rows.map((r) => (
          <div key={r.id} className="md__row">
            <div className="md__when">{fmtDateTime(r.at)}</div>

            <div className="md__what">
              <span className={`pill pill--sm ${movementTone(r.type)}`}>
                {movementLabel(r.type)}
              </span>
              <div className="md__reason">{r.reason}</div>
              {r.note && <div className="md__note">{r.note}</div>}
              {r.refTable && (
                <div className="md__ref">
                  {DOC_LABEL[r.refTable] || r.refTable}
                  {r.refId ? ` · ${String(r.refId).slice(0, 8)}` : ''}
                </div>
              )}
            </div>

            <div className={`md__qty ${r.delta < 0 ? 'neg' : 'pos'}`}>
              {r.delta > 0 ? '+' : ''}{fmt(r.delta)} {cell.unit}
              {r.balanceAfter !== null && (
                <div className="md__after">
                  <ArrowRight size={11} /> {fmt(r.balanceAfter)}
                </div>
              )}
            </div>
          </div>
        ))}

        {rows.length >= 500 && (
          <div className="md__capped">
            Showing the most recent 500 entries. Narrow the date range to see further back.
          </div>
        )}

        <style>{`
          .md { width: 560px; }
          .md__head {
            display: flex; align-items: flex-start; gap: 12px;
            padding-bottom: 14px; border-bottom: 1px solid var(--color-border);
          }
          .md__totals {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
            padding: 14px 0; border-bottom: 1px solid var(--color-border-soft);
          }
          .md__totals div { display: flex; flex-direction: column; gap: 2px; }
          .md__totals span {
            font-size: 11px; font-weight: 600; color: var(--color-text-muted);
          }
          .md__totals strong { font-size: 14px; font-variant-numeric: tabular-nums; }

          .md__row {
            display: flex; gap: 12px; align-items: flex-start;
            padding: 11px 0; border-bottom: 1px solid var(--color-border-soft);
          }
          .md__when {
            width: 116px; flex-shrink: 0; font-size: 11.5px;
            color: var(--color-text-muted); font-variant-numeric: tabular-nums;
          }
          .md__what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
          .md__reason { font-size: 13px; font-weight: 600; }
          .md__note, .md__ref { font-size: 11.5px; color: var(--color-text-muted); }
          .md__qty {
            width: 116px; flex-shrink: 0; text-align: right;
            font-size: 13.5px; font-weight: 700; font-variant-numeric: tabular-nums;
          }
          .md__after {
            display: flex; align-items: center; gap: 3px; justify-content: flex-end;
            font-size: 11px; font-weight: 500; color: var(--color-text-muted);
          }
          .pos { color: var(--color-success); }
          .neg { color: var(--color-danger); }
          .md__capped {
            padding-top: 12px; font-size: 12px; color: var(--color-text-muted);
          }
        `}</style>
      </div>
    </>
  );
}
