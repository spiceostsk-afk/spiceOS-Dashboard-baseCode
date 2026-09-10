import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * Complimentary Report — food that left the kitchen and was never charged for.
 *
 * There is no "complimentary" button on the till, so this cannot read a flag.
 * It reads the thing staff actually do instead: settle the table for nothing.
 * A bill counts as complimentary when food worth something was served and the
 * guest was charged nothing — either the whole subtotal was discounted away,
 * or the bill was settled at zero.
 *
 * That definition is stated on the screen rather than buried here, because a
 * report whose rule the reader cannot see is a report they cannot argue with.
 * If comps are ever given a mark of their own, this is the one place to change.
 */


/** yyyy-mm-dd in LOCAL time. `toISOString` would push an 11pm sale onto the
 *  next day, which is not the trading day the restaurant was in. */
const dayOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};


const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

// A rupee either way is rounding, not a charge.
const FREE_EPSILON = 1;

const GROUPINGS = [
  { key: 'bill', label: 'Every complimentary bill' },
  { key: 'item', label: 'Dish given away' },
  { key: 'day', label: 'Day' },
];

export default function ComplimentaryReport() {
  const periodProps = useReportPeriod('this_month');
  const { sessions, bills, loading, error } = useSalesData(periodProps.range);
  const [groupBy, setGroupBy] = useState('bill');

  const comps = useMemo(() => {
    const sessionById = new Map((sessions || []).map((s) => [s.id, s]));

    return (bills || [])
      .filter((b) => {
        const subtotal = Number(b.subtotal) || 0;
        const charged = Number(b.grand_total) || 0;
        // Food had value, and nothing was taken for it.
        return subtotal > 0 && charged <= FREE_EPSILON;
      })
      .map((b) => {
        const s = sessionById.get(b.session_id);
        const lines = (s?.orders || []).flatMap((o) =>
          (o.order_items || [])
            .filter((oi) => !oi.is_cancelled)
            .map((oi) => ({
              name: oi.menu_items?.item_name || '(deleted dish)',
              qty: Number(oi.quantity) || 0,
              amount: Number(oi.total_price ?? (oi.item_price * oi.quantity)) || 0,
            })));

        return {
          id: b.id,
          billNo: `#${String(b.session_id || b.id).slice(0, 4).toUpperCase()}`,
          at: b.paid_at || s?.ended_at,
          day: dayOf(b.paid_at || s?.ended_at),
          customer: s?.customer_name || 'Walk-in',
          table: s?.restaurant_tables?.table_number || '—',
          mode: b.payment_method || 'other',
          value: round(Number(b.subtotal) || 0),
          items: lines.reduce((n, l) => n + l.qty, 0),
          lines,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [bills, sessions]);

  const rows = useMemo(() => {
    if (groupBy === 'bill') return comps;

    if (groupBy === 'item') {
      const map = new Map();
      comps.forEach((c) => c.lines.forEach((l) => {
        if (!map.has(l.name)) map.set(l.name, { id: l.name, name: l.name, qty: 0, value: 0, bills: new Set() });
        const r = map.get(l.name);
        r.qty += l.qty;
        r.value += l.amount;
        r.bills.add(c.id);
      }));
      return [...map.values()].map((r) => ({
        ...r, value: round(r.value), bills: r.bills.size,
      }));
    }

    const map = new Map();
    comps.forEach((c) => {
      if (!map.has(c.day)) map.set(c.day, { id: c.day, day: c.day, bills: 0, items: 0, value: 0 });
      const r = map.get(c.day);
      r.bills += 1;
      r.items += c.items;
      r.value += c.value;
    });
    return [...map.values()].map((r) => ({ ...r, value: round(r.value) }));
  }, [comps, groupBy]);

  const totals = useMemo(() => {
    const value = comps.reduce((s, c) => s + c.value, 0);
    const paid = (bills || []).filter((b) => b.payment_status === 'paid');
    const grossAll = paid.reduce((s, b) => s + (Number(b.subtotal) || 0), 0);
    const dishes = new Set(comps.flatMap((c) => c.lines.map((l) => l.name)));
    return {
      bills: comps.length,
      items: comps.reduce((n, c) => n + c.items, 0),
      dishes: dishes.size,
      value: round(value),
      ofAll: grossAll ? round((value / grossAll) * 100, 1) : 0,
    };
  }, [comps, bills]);

  const columns = useMemo(() => {
    const valueCell = {
      key: 'value', label: 'Value given', align: 'right', total: true, money: true,
      render: (r) => money(r.value),
    };

    switch (groupBy) {
      case 'item':
        return [
          { key: 'name', label: 'Dish' },
          { key: 'qty', label: 'Qty given', align: 'right', total: true },
          { key: 'bills', label: 'Bills', align: 'right', total: true },
          valueCell,
        ];
      case 'day':
        return [
          { key: 'day', label: 'Date', render: (r) => fmtDate(r.day) },
          { key: 'bills', label: 'Bills', align: 'right', total: true },
          { key: 'items', label: 'Items', align: 'right', total: true },
          valueCell,
        ];
      default:
        return [
          { key: 'billNo', label: 'Bill' },
          { key: 'at', label: 'Closed', render: (r) => fmtDateTime(r.at) },
          { key: 'table', label: 'Table' },
          { key: 'customer', label: 'Customer' },
          { key: 'items', label: 'Items', align: 'right', total: true },
          {
            key: 'lines',
            label: 'What was served',
            render: (r) => r.lines.map((l) => `${l.qty}× ${l.name}`).join(', ') || '—',
          },
          valueCell,
        ];
    }
  }, [groupBy]);

  return (
    <ReportPage
      title="Complimentary Report"
      subtitle="Food served and never charged for"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Complimentary bills', value: num(totals.bills) },
        { label: 'Items given', value: num(totals.items) },
        { label: 'Distinct dishes', value: num(totals.dishes) },
        { label: 'Value given away', value: money(totals.value), tone: 'var(--color-danger)' },
        { label: 'Of all takings', value: `${totals.ofAll}%` },
      ]}
    >
      <div className="cr-note">
        <Info size={14} />
        <span>
          A bill counts here when food was served and nothing was charged — the
          whole amount discounted, or settled at zero. The till has no separate
          complimentary button, so a comp rung up as a normal discount will show
          in the Discount Report instead.
        </span>
      </div>

      <div className="card cr-filters">
        <div className="field">
          <label>Group table by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <ReportTable
        key={groupBy}
        filename={`complimentary-report-by-${groupBy}`}
        rows={rows}
        loading={loading}
        initialSort={{ key: 'value', dir: 'desc' }}
        empty={{
          title: 'Nothing was given away in this period',
          sub: 'Every settled bill was charged for.',
        }}
        columns={columns}
      />

      <style>{`
        .cr-note {
          display: flex; gap: 9px; align-items: flex-start;
          padding: 11px 14px; border-radius: var(--radius-md);
          background: var(--color-well, #F6F7F9);
          border: 1px solid var(--color-border-soft);
          font-size: 12.5px; line-height: 1.6; color: var(--color-text-muted);
        }
        .cr-note svg { flex-shrink: 0; margin-top: 2px; }
        .cr-filters {
          display: grid; gap: 14px; align-items: end;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
      `}</style>
    </ReportPage>
  );
}
