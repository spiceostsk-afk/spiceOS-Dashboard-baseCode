import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useReportPeriod } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * Wastage Report — what was thrown away, why, and what it cost.
 *
 * Grouped by reason first, because the reason is the only column anyone can
 * act on. Knowing ₹4,000 of paneer was binned is a fact; knowing ₹3,600 of it
 * was over-prep is a decision.
 *
 * Only POSTED wastage counts: a draft has not left the shelf.
 */


const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

const qtyLabel = (n) => {
  const v = round(n, 3);
  return Number.isInteger(v) ? num(v) : String(v);
};

const GROUPINGS = [
  { key: 'reason', label: 'Reason' },
  { key: 'item', label: 'Inventory item' },
  { key: 'date', label: 'Date' },
];

export default function WastageReport() {
  const periodProps = useReportPeriod('this_month');
  const { range } = periodProps;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupBy, setGroupBy] = useState('reason');

  const fromDay = range.from.toISOString().slice(0, 10);
  const toDay = range.to.toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from('stock_wastage')
        .select(`
          id, wasted_on, status, note, total_value, posted_at,
          stock_wastage_items (
            id, inventory_item_id, qty_base, reason, rate,
            inventory_items ( item_name, unit )
          )
        `)
        .eq('status', 'posted')
        .gte('wasted_on', fromDay)
        .lte('wasted_on', toDay)
        .order('wasted_on', { ascending: false });

      if (qErr) throw qErr;
      setEntries(data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading wastage report:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDay, toDay]);

  useEffect(() => { load(); }, [load]);

  const lines = useMemo(() => entries.flatMap((w) => (w.stock_wastage_items || []).map((l) => {
    const item = l.inventory_items || {};
    const qty = Number(l.qty_base) || 0;
    const rate = Number(l.rate) || 0;
    return {
      lineId: l.id,
      date: w.wasted_on,
      docId: w.id,
      note: w.note || '',
      reason: (l.reason || 'Unspecified').trim() || 'Unspecified',
      itemId: l.inventory_item_id || 'none',
      itemName: item.item_name || 'Unknown item',
      unit: item.unit || '',
      qty,
      value: round(qty * rate),
    };
  })), [entries]);

  const rows = useMemo(() => {
    const keyOf = (l) => {
      switch (groupBy) {
        case 'item': return l.itemId;
        case 'date': return l.date;
        default: return l.reason.toLowerCase();
      }
    };

    const map = new Map();
    lines.forEach((l) => {
      const k = keyOf(l);
      if (!map.has(k)) {
        map.set(k, {
          id: k,
          reason: l.reason,
          itemName: l.itemName,
          date: l.date,
          units: new Set(),
          items: new Set(),
          reasons: new Set(),
          entries: new Set(),
          qty: 0,
          value: 0,
        });
      }
      const r = map.get(k);
      r.qty += l.qty;
      r.value += l.value;
      if (l.unit) r.units.add(l.unit);
      r.items.add(l.itemId);
      r.reasons.add(l.reason);
      r.entries.add(l.docId);
    });

    const grand = [...map.values()].reduce((s, r) => s + r.value, 0);
    return [...map.values()].map((r) => ({
      ...r,
      qty: round(r.qty, 3),
      value: round(r.value),
      unit: r.units.size === 1 ? [...r.units][0] : '',
      itemCount: r.items.size,
      reasonCount: r.reasons.size,
      entryCount: r.entries.size,
      share: grand ? round((r.value / grand) * 100, 1) : 0,
    }));
  }, [lines, groupBy]);

  const totals = useMemo(() => ({
    entries: new Set(lines.map((l) => l.docId)).size,
    items: new Set(lines.map((l) => l.itemId)).size,
    reasons: new Set(lines.map((l) => l.reason.toLowerCase())).size,
    value: round(lines.reduce((s, l) => s + l.value, 0)),
  }), [lines]);

  const qtyCell = {
    key: 'qty',
    label: 'Quantity',
    align: 'right',
    total: true,
    render: (r) => `${qtyLabel(r.qty)}${r.unit ? ` ${r.unit}` : ''}`,
  };
  const valueCell = {
    key: 'value', label: 'Value lost', align: 'right', total: true, money: true,
    render: (r) => money(r.value),
  };
  const shareCell = {
    key: 'share', label: 'Share', align: 'right', render: (r) => `${r.share}%`,
  };

  const columns = useMemo(() => {
    switch (groupBy) {
      case 'item':
        return [
          { key: 'itemName', label: 'Inventory item' },
          { key: 'reasonCount', label: 'Reasons', align: 'right' },
          { key: 'entryCount', label: 'Entries', align: 'right', total: true },
          qtyCell, valueCell, shareCell,
        ];
      case 'date':
        return [
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'itemCount', label: 'Items', align: 'right' },
          { key: 'reasonCount', label: 'Reasons', align: 'right' },
          qtyCell, valueCell, shareCell,
        ];
      default:
        return [
          { key: 'reason', label: 'Reason' },
          { key: 'itemCount', label: 'Items', align: 'right' },
          { key: 'entryCount', label: 'Entries', align: 'right', total: true },
          qtyCell, valueCell, shareCell,
        ];
    }
  }, [groupBy]);

  return (
    <ReportPage
      title="Wastage Report"
      subtitle="Posted wastage entries — what was written off and why"
      periodProps={periodProps}
      loading={loading}
      error={error}
      actions={(
        <button className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      )}
      cards={[
        { label: 'Entries', value: num(totals.entries) },
        { label: 'Items affected', value: num(totals.items) },
        { label: 'Distinct reasons', value: num(totals.reasons) },
        { label: 'Value lost', value: money(totals.value), tone: 'var(--color-danger)' },
      ]}
    >
      <div className="card wr-filters">
        <div className="field">
          <label>Group table by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <ReportTable
        key={groupBy}
        filename={`wastage-report-by-${groupBy}`}
        rows={rows}
        loading={loading}
        initialSort={{ key: groupBy === 'date' ? 'date' : 'value', dir: 'desc' }}
        empty={{
          title: 'No wastage in this period',
          sub: 'Only posted entries count — a draft has not left the shelf.',
        }}
        columns={columns}
      />

      <style>{`
        .wr-filters {
          display: grid; gap: 14px; align-items: end;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
      `}</style>
    </ReportPage>
  );
}
