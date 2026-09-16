import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useReportPeriod } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtDateTime, isoDay } from '../../lib/dates';

/**
 * Void KOT report: food the kitchen was sent a ticket for and that was never sold.
 *
 * The client's rule: a KOT is not proof of sale, a settled bill is. A voided
 * KOT has still been cooked, so its stock stays used, but it earns nothing.
 * This is where that value surfaces, instead of vanishing from both sales and
 * stock without a trace.
 *
 * Three ways a KOT line ends up void, and all three count:
 *   - the line itself was voided (order_items.is_cancelled), from Billing or
 *     the captain's Cancel item;
 *   - the whole table was voided (customer_sessions status void or cancelled);
 *   - an order was voided on its own (orders.order_status cancelled).
 *
 * A line DELETED from a bill is not here: a delete means it was entered by
 * mistake and never cooked, and it returns its stock.
 */

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

const LINE_FIELDS = 'id, quantity, item_price, total_price, is_cancelled, cancel_reason, cancelled_at, menu_items ( item_name )';

const GROUPINGS = [
  { key: 'line', label: 'Every void line' },
  { key: 'item', label: 'Dish' },
  { key: 'day', label: 'Day' },
];

function useVoidKots(range) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cancelledRes, voidTablesRes, voidOrdersRes] = await Promise.all([
        supabase
          .from('order_items')
          .select(`${LINE_FIELDS}, orders ( customer_sessions ( customer_name, restaurant_tables ( table_number ) ) )`)
          .eq('is_cancelled', true)
          .gte('cancelled_at', fromIso)
          .lte('cancelled_at', toIso),
        supabase
          .from('customer_sessions')
          .select(`id, customer_name, ended_at, metadata, restaurant_tables ( table_number ), orders ( order_items ( ${LINE_FIELDS} ) )`)
          .in('session_status', ['void', 'cancelled'])
          .gte('ended_at', fromIso)
          .lte('ended_at', toIso),
        supabase
          .from('orders')
          .select(`id, created_at, order_items ( ${LINE_FIELDS} ), customer_sessions ( session_status, customer_name, restaurant_tables ( table_number ) )`)
          .eq('order_status', 'cancelled')
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
      ]);
      for (const r of [cancelledRes, voidTablesRes, voidOrdersRes]) if (r.error) throw r.error;

      const byId = new Map();
      const add = (oi, extra) => {
        if (byId.has(oi.id)) return;           // one line, counted once
        byId.set(oi.id, {
          id: oi.id,
          dish: oi.menu_items?.item_name || '(deleted dish)',
          qty: Number(oi.quantity) || 0,
          value: round(oi.total_price ?? (Number(oi.item_price) * Number(oi.quantity))),
          cost: 0,
          ...extra,
        });
      };

      // Line voids first: they carry their own time and reason.
      (cancelledRes.data || []).forEach((oi) => {
        const s = oi.orders?.customer_sessions;
        add(oi, {
          at: oi.cancelled_at, kind: 'Item voided', reason: oi.cancel_reason,
          table: s?.restaurant_tables?.table_number, customer: s?.customer_name,
        });
      });

      (voidTablesRes.data || []).forEach((s) => {
        (s.orders || []).forEach((o) => (o.order_items || []).forEach((oi) => add(oi, {
          at: s.ended_at, kind: 'Table voided', reason: s.metadata?.voidReason,
          table: s.restaurant_tables?.table_number, customer: s.customer_name,
        })));
      });

      (voidOrdersRes.data || []).forEach((o) => {
        const s = o.customer_sessions;
        // A voided table cancels its orders too; it is already counted above,
        // dated by when the table was voided.
        if (['void', 'cancelled'].includes(s?.session_status)) return;
        (o.order_items || []).forEach((oi) => add(oi, {
          at: o.created_at, kind: 'Order voided', reason: null,
          table: s?.restaurant_tables?.table_number, customer: s?.customer_name,
        }));
      });

      // What the kitchen used for them, at the last purchase rate. Read from
      // the stock ledger itself, so it is exactly what was deducted.
      const ids = [...byId.keys()];
      for (let i = 0; i < ids.length; i += 150) {
        const { data: moves, error: mErr } = await supabase
          .from('stock_movements')
          .select('ref_id, delta, inventory_items ( last_purchase_rate )')
          .eq('ref_table', 'order_items')
          .eq('movement_type', 'consumption')
          .in('ref_id', ids.slice(i, i + 150));
        if (mErr) throw mErr;
        (moves || []).forEach((m) => {
          const row = byId.get(m.ref_id);
          if (row) row.cost += -Number(m.delta) * (Number(m.inventory_items?.last_purchase_rate) || 0);
        });
      }

      setLines([...byId.values()].map((r) => ({ ...r, cost: round(r.cost), day: r.at ? isoDay(r.at) : '' })));
      setError(null);
    } catch (err) {
      console.error('Error loading void KOTs:', err);
      setError(err.message);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso]);

  useEffect(() => { load(); }, [load]);

  return { lines, loading, error };
}

export default function VoidKotReport() {
  const periodProps = useReportPeriod('this_month');
  const { lines, loading, error } = useVoidKots(periodProps.range);
  const [groupBy, setGroupBy] = useState('line');

  const rows = useMemo(() => {
    if (groupBy === 'line') return lines;

    const key = groupBy === 'item' ? 'dish' : 'day';
    const map = new Map();
    lines.forEach((l) => {
      const k = l[key];
      if (!map.has(k)) map.set(k, { id: k, dish: l.dish, day: l.day, lines: 0, qty: 0, value: 0, cost: 0 });
      const r = map.get(k);
      r.lines += 1;
      r.qty += l.qty;
      r.value += l.value;
      r.cost += l.cost;
    });
    return [...map.values()].map((r) => ({ ...r, value: round(r.value), cost: round(r.cost) }));
  }, [lines, groupBy]);

  const totals = useMemo(() => ({
    value: lines.reduce((s, l) => s + l.value, 0),
    cost: lines.reduce((s, l) => s + l.cost, 0),
    qty: lines.reduce((s, l) => s + l.qty, 0),
  }), [lines]);

  const valueCols = [
    { key: 'qty', label: 'Qty', align: 'right', total: true },
    {
      key: 'value', label: 'Void KOT value', align: 'right', total: true, money: true,
      render: (r) => money(r.value),
    },
    {
      key: 'cost', label: 'Stock used', align: 'right', total: true, money: true,
      render: (r) => money(r.cost),
    },
  ];

  const columns = {
    line: [
      { key: 'at', label: 'When', render: (r) => fmtDateTime(r.at) },
      { key: 'table', label: 'Table', render: (r) => r.table || '—' },
      { key: 'dish', label: 'Dish' },
      ...valueCols,
      { key: 'kind', label: 'Type' },
      { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
    ],
    item: [
      { key: 'dish', label: 'Dish' },
      { key: 'lines', label: 'Void lines', align: 'right', total: true },
      ...valueCols,
    ],
    day: [
      { key: 'day', label: 'Date', render: (r) => fmtDate(r.day) },
      { key: 'lines', label: 'Void lines', align: 'right', total: true },
      ...valueCols,
    ],
  }[groupBy];

  return (
    <ReportPage
      title="Void KOT report"
      subtitle="Sent to the kitchen, never sold. Stock used, nothing earned"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Void KOT value', value: money(totals.value), tone: totals.value > 0 ? 'var(--color-danger)' : undefined },
        { label: 'Stock used for them', value: money(totals.cost) },
        { label: 'Dishes voided', value: num(totals.qty) },
        { label: 'Void lines', value: num(lines.length) },
      ]}
    >
      <div className="vk-note">
        <Info size={14} />
        <span>
          A voided KOT is not a sale, so it is left out of every sales figure. It
          was cooked, so its ingredients stay deducted from stock. Stock used is
          valued at each ingredient&apos;s last purchase rate. A line deleted from a
          bill before its KOT was sent is a mistake, not a void: it returns its
          stock and is not listed.
        </span>
      </div>

      <div className="card vk-filters">
        <div className="field">
          <label>Group table by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <ReportTable
        key={groupBy}
        filename={`void-kot-report-by-${groupBy}`}
        rows={rows}
        loading={loading}
        initialSort={{ key: groupBy === 'line' ? 'at' : 'value', dir: 'desc' }}
        empty={{ title: 'No void KOTs in this period', sub: 'Everything sent to the kitchen was sold.' }}
        columns={columns}
      />

      <style>{`
        .vk-note {
          display: flex; gap: 9px; align-items: flex-start;
          padding: 11px 14px; border-radius: var(--radius-md);
          background: var(--color-well, #F6F7F9);
          border: 1px solid var(--color-border-soft);
          font-size: 12.5px; line-height: 1.6; color: var(--color-text-muted);
        }
        .vk-note svg { flex-shrink: 0; margin-top: 2px; }
        .vk-filters {
          display: grid; gap: 14px; align-items: end;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
      `}</style>
    </ReportPage>
  );
}
