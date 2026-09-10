import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useReportPeriod } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * Transfer Report — stock that moved between the kitchen and its other units.
 *
 * Both directions in one report, because a transfer is one event seen from two
 * ends: what the factory sent out is what the outlet took in, and reading them
 * on separate screens is how the two stop agreeing.
 *
 * Only SENT or RECEIVED transfers count. A draft has moved nothing.
 */


const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

const qtyLabel = (n) => {
  const v = round(n, 3);
  return Number.isInteger(v) ? num(v) : String(v);
};

const DIRECTIONS = [
  { key: 'all', label: 'In and out' },
  { key: 'out', label: 'Out only' },
  { key: 'in', label: 'In only' },
];

const GROUPINGS = [
  { key: 'item', label: 'Inventory item' },
  { key: 'date', label: 'Date' },
  { key: 'party', label: 'From / to' },
  { key: 'document', label: 'Transfer note' },
];

export default function TransferReport() {
  const periodProps = useReportPeriod('this_month');
  const { range } = periodProps;

  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [direction, setDirection] = useState('all');
  const [groupBy, setGroupBy] = useState('item');

  const fromDay = range.from.toISOString().slice(0, 10);
  const toDay = range.to.toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from('stock_transfers')
        .select(`
          id, transfer_date, reference_no, status, note, direction,
          from_label, to_label, sent_at, received_at,
          stock_transfer_items (
            id, inventory_item_id, qty_base, received_qty_base, rate,
            inventory_items ( item_name, unit )
          )
        `)
        .in('status', ['sent', 'received'])
        .gte('transfer_date', fromDay)
        .lte('transfer_date', toDay)
        .order('transfer_date', { ascending: false });

      if (qErr) throw qErr;
      setTransfers(data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading transfer report:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDay, toDay]);

  useEffect(() => { load(); }, [load]);

  /** One row per transferred line. */
  const lines = useMemo(() => transfers.flatMap((t) => (t.stock_transfer_items || []).map((l) => {
    const item = l.inventory_items || {};
    // What was received is the truth once it has been received; until then the
    // sent quantity is the best the report has.
    const qty = t.status === 'received' && l.received_qty_base !== null
      ? Number(l.received_qty_base) || 0
      : Number(l.qty_base) || 0;
    const sentQty = Number(l.qty_base) || 0;
    const rate = Number(l.rate) || 0;
    return {
      lineId: l.id,
      date: t.transfer_date,
      direction: t.direction || 'out',
      docId: t.id,
      reference: t.reference_no || 'No reference',
      status: t.status,
      from: t.from_label || 'This kitchen',
      to: t.to_label || 'This kitchen',
      itemId: l.inventory_item_id || 'none',
      itemName: item.item_name || 'Unknown item',
      unit: item.unit || '',
      qty,
      sentQty,
      // A short receipt is the thing a transfer report exists to catch.
      shortBy: round(sentQty - qty, 3),
      value: round(qty * rate),
      rate,
    };
  })), [transfers]);

  const filtered = useMemo(
    () => (direction === 'all' ? lines : lines.filter((l) => l.direction === direction)),
    [lines, direction],
  );

  const rows = useMemo(() => {
    const keyOf = (l) => {
      switch (groupBy) {
        case 'date': return `${l.date}|${l.direction}`;
        case 'party': return `${l.from}→${l.to}`;
        case 'document': return l.docId;
        default: return `${l.itemId}|${l.direction}`;
      }
    };

    const map = new Map();
    filtered.forEach((l) => {
      const k = keyOf(l);
      if (!map.has(k)) {
        map.set(k, {
          id: k,
          date: l.date,
          direction: l.direction,
          itemName: l.itemName,
          reference: l.reference,
          from: l.from,
          to: l.to,
          unit: l.unit,
          units: new Set(),
          items: new Set(),
          docs: new Set(),
          qty: 0,
          sentQty: 0,
          shortBy: 0,
          value: 0,
        });
      }
      const r = map.get(k);
      r.qty += l.qty;
      r.sentQty += l.sentQty;
      r.shortBy += l.shortBy;
      r.value += l.value;
      if (l.unit) r.units.add(l.unit);
      r.items.add(l.itemId);
      r.docs.add(l.docId);
    });

    return [...map.values()].map((r) => ({
      ...r,
      qty: round(r.qty, 3),
      sentQty: round(r.sentQty, 3),
      shortBy: round(r.shortBy, 3),
      value: round(r.value),
      unit: r.units.size === 1 ? [...r.units][0] : '',
      itemCount: r.items.size,
      docCount: r.docs.size,
    }));
  }, [filtered, groupBy]);

  const totals = useMemo(() => {
    const out = filtered.filter((l) => l.direction === 'out');
    const inn = filtered.filter((l) => l.direction === 'in');
    return {
      docs: new Set(filtered.map((l) => l.docId)).size,
      items: new Set(filtered.map((l) => l.itemId)).size,
      outValue: round(out.reduce((s, l) => s + l.value, 0)),
      inValue: round(inn.reduce((s, l) => s + l.value, 0)),
      short: round(filtered.reduce((s, l) => s + Math.max(0, l.shortBy), 0), 3),
    };
  }, [filtered]);

  const directionCell = {
    key: 'direction',
    label: 'Direction',
    render: (r) => (
      <span className={`pill pill--sm ${r.direction === 'in' ? 'tone-green' : 'tone-amber'}`}>
        {r.direction === 'in' ? 'In' : 'Out'}
      </span>
    ),
  };

  const qtyCell = {
    key: 'qty',
    label: 'Quantity',
    align: 'right',
    total: true,
    render: (r) => `${qtyLabel(r.qty)}${r.unit ? ` ${r.unit}` : ''}`,
  };

  const shortCell = {
    key: 'shortBy',
    label: 'Short',
    align: 'right',
    render: (r) => (r.shortBy > 0
      ? <span style={{ color: 'var(--color-danger)' }}>{qtyLabel(r.shortBy)}</span>
      : '—'),
  };

  const valueCell = {
    key: 'value', label: 'Value', align: 'right', total: true, money: true,
    render: (r) => money(r.value),
  };

  const columns = useMemo(() => {
    switch (groupBy) {
      case 'date':
        return [
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          directionCell,
          { key: 'itemCount', label: 'Items', align: 'right' },
          { key: 'docCount', label: 'Notes', align: 'right', total: true },
          qtyCell, shortCell, valueCell,
        ];
      case 'party':
        return [
          { key: 'from', label: 'From' },
          { key: 'to', label: 'To' },
          { key: 'itemCount', label: 'Items', align: 'right' },
          { key: 'docCount', label: 'Notes', align: 'right', total: true },
          qtyCell, valueCell,
        ];
      case 'document':
        return [
          { key: 'reference', label: 'Reference' },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          directionCell,
          { key: 'from', label: 'From' },
          { key: 'to', label: 'To' },
          { key: 'itemCount', label: 'Lines', align: 'right', total: true },
          qtyCell, valueCell,
        ];
      default:
        return [
          { key: 'itemName', label: 'Inventory item' },
          directionCell,
          { key: 'docCount', label: 'Notes', align: 'right', total: true },
          qtyCell, shortCell, valueCell,
        ];
    }
  }, [groupBy]);

  return (
    <ReportPage
      title="Transfer Report"
      subtitle="Stock moved in and out, from sent and received transfer notes"
      periodProps={periodProps}
      loading={loading}
      error={error}
      actions={(
        <button className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      )}
      cards={[
        { label: 'Transfer notes', value: num(totals.docs) },
        { label: 'Items moved', value: num(totals.items) },
        { label: 'Value out', value: money(totals.outValue) },
        { label: 'Value in', value: money(totals.inValue) },
        {
          label: 'Short on receipt',
          value: qtyLabel(totals.short),
          tone: totals.short > 0 ? 'var(--color-danger)' : undefined,
        },
      ]}
    >
      <div className="card tr-filters">
        <div className="field">
          <label>Direction</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            {DIRECTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Group table by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <ReportTable
        key={`${groupBy}-${direction}`}
        filename={`transfer-report-by-${groupBy}`}
        rows={rows}
        loading={loading}
        initialSort={{ key: groupBy === 'date' ? 'date' : 'value', dir: 'desc' }}
        empty={{
          title: 'No transfers in this period',
          sub: 'Only sent or received notes count — a draft has moved no stock.',
        }}
        columns={columns}
      />

      <style>{`
        .tr-filters {
          display: grid; gap: 14px; align-items: end;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
      `}</style>
    </ReportPage>
  );
}
