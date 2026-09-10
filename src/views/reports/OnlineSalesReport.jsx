import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * Online Report — what the aggregators brought in.
 *
 * Zomato and Swiggy are recorded as payment modes, because that is what they
 * are at the till: the platform settles the bill on the guest's behalf. So the
 * report is a slice of the settled bills rather than a separate ledger, and it
 * will always tie back to the payment-mode report to the rupee.
 *
 * Home delivery taken directly is included as its own channel. It is online
 * business by every definition the kitchen cares about, and leaving it out
 * would make the delivery total wrong on a screen called Online.
 */

const CHANNELS = {
  zomato: { label: 'Zomato', tone: 'tone-red' },
  swiggy: { label: 'Swiggy', tone: 'tone-amber' },
  home_delivery: { label: 'Home delivery', tone: 'tone-blue' },
};


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

const GROUPINGS = [
  { key: 'channel', label: 'Channel' },
  { key: 'day', label: 'Day' },
  { key: 'item', label: 'Dish' },
  { key: 'order', label: 'Every online order' },
];

export default function OnlineSalesReport() {
  const periodProps = useReportPeriod('this_month');
  const { sessions, bills, loading, error } = useSalesData(periodProps.range);
  const [groupBy, setGroupBy] = useState('channel');

  const orders = useMemo(() => {
    const sessionById = new Map((sessions || []).map((s) => [s.id, s]));

    return (bills || [])
      .filter((b) => b.payment_status === 'paid'
        && CHANNELS[String(b.payment_method || '').toLowerCase()])
      .map((b) => {
        const channel = CHANNELS[String(b.payment_method).toLowerCase()];
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
          channel: channel.label,
          tone: channel.tone,
          at: b.paid_at,
          day: dayOf(b.paid_at),
          customer: s?.customer_name || 'Online guest',
          items: lines.reduce((n, l) => n + l.qty, 0),
          discount: round(Number(b.discount_amount) || 0),
          amount: round(Number(b.grand_total) || 0),
          lines,
        };
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [bills, sessions]);

  const rows = useMemo(() => {
    if (groupBy === 'order') return orders;

    if (groupBy === 'item') {
      const map = new Map();
      orders.forEach((o) => o.lines.forEach((l) => {
        const key = `${l.name}||${o.channel}`;
        if (!map.has(key)) {
          map.set(key, { id: key, name: l.name, channel: o.channel, tone: o.tone, qty: 0, amount: 0, orders: new Set() });
        }
        const r = map.get(key);
        r.qty += l.qty;
        r.amount += l.amount;
        r.orders.add(o.id);
      }));
      return [...map.values()].map((r) => ({
        ...r, amount: round(r.amount), orders: r.orders.size,
      }));
    }

    const keyOf = (o) => (groupBy === 'day' ? o.day : o.channel);
    const map = new Map();
    orders.forEach((o) => {
      const k = keyOf(o);
      if (!map.has(k)) {
        map.set(k, {
          id: k, day: o.day, channel: o.channel, tone: o.tone,
          orders: 0, items: 0, discount: 0, amount: 0, channels: new Set(),
        });
      }
      const r = map.get(k);
      r.orders += 1;
      r.items += o.items;
      r.discount += o.discount;
      r.amount += o.amount;
      r.channels.add(o.channel);
    });

    const grand = [...map.values()].reduce((s, r) => s + r.amount, 0);
    return [...map.values()].map((r) => ({
      ...r,
      discount: round(r.discount),
      amount: round(r.amount),
      avg: r.orders ? round(r.amount / r.orders) : 0,
      channelCount: r.channels.size,
      share: grand ? round((r.amount / grand) * 100, 1) : 0,
    }));
  }, [orders, groupBy]);

  const totals = useMemo(() => {
    const amount = orders.reduce((s, o) => s + o.amount, 0);
    const allPaid = (bills || []).filter((b) => b.payment_status === 'paid');
    const allValue = allPaid.reduce((s, b) => s + (Number(b.grand_total) || 0), 0);
    return {
      orders: orders.length,
      items: orders.reduce((n, o) => n + o.items, 0),
      amount: round(amount),
      avg: orders.length ? round(amount / orders.length) : 0,
      ofAll: allValue ? round((amount / allValue) * 100, 1) : 0,
    };
  }, [orders, bills]);

  const channelCell = {
    key: 'channel',
    label: 'Channel',
    render: (r) => <span className={`pill pill--sm ${r.tone}`}>{r.channel}</span>,
  };
  const amountCell = {
    key: 'amount', label: 'Sale', align: 'right', total: true, money: true,
    render: (r) => money(r.amount),
  };

  const columns = useMemo(() => {
    switch (groupBy) {
      case 'day':
        return [
          { key: 'day', label: 'Date', render: (r) => fmtDate(r.day) },
          { key: 'channelCount', label: 'Channels', align: 'right' },
          { key: 'orders', label: 'Orders', align: 'right', total: true },
          { key: 'items', label: 'Items', align: 'right', total: true },
          { key: 'avg', label: 'Avg order', align: 'right', render: (r) => money(r.avg) },
          amountCell,
          { key: 'share', label: 'Share', align: 'right', render: (r) => `${r.share}%` },
        ];
      case 'item':
        return [
          { key: 'name', label: 'Dish' },
          channelCell,
          { key: 'qty', label: 'Qty sold', align: 'right', total: true },
          { key: 'orders', label: 'Orders', align: 'right', total: true },
          amountCell,
        ];
      case 'order':
        return [
          { key: 'billNo', label: 'Order' },
          channelCell,
          { key: 'at', label: 'Settled', render: (r) => fmtDateTime(r.at) },
          { key: 'customer', label: 'Customer' },
          { key: 'items', label: 'Items', align: 'right', total: true },
          {
            key: 'lines',
            label: 'What was ordered',
            render: (r) => r.lines.map((l) => `${l.qty}× ${l.name}`).join(', ') || '—',
          },
          amountCell,
        ];
      default:
        return [
          channelCell,
          { key: 'orders', label: 'Orders', align: 'right', total: true },
          { key: 'items', label: 'Items', align: 'right', total: true },
          { key: 'avg', label: 'Avg order', align: 'right', render: (r) => money(r.avg) },
          {
            key: 'discount', label: 'Discount', align: 'right', total: true, money: true,
            render: (r) => money(r.discount),
          },
          amountCell,
          { key: 'share', label: 'Share', align: 'right', render: (r) => `${r.share}%` },
        ];
    }
  }, [groupBy]);

  return (
    <ReportPage
      title="Online Report"
      subtitle="Zomato, Swiggy and direct delivery, from settled bills"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Online orders', value: num(totals.orders) },
        { label: 'Items sold', value: num(totals.items) },
        { label: 'Online sale', value: money(totals.amount) },
        { label: 'Avg order', value: money(totals.avg) },
        { label: 'Of all takings', value: `${totals.ofAll}%` },
      ]}
    >
      <div className="or-note">
        <Info size={14} />
        <span>
          Counted from bills settled to an aggregator at the till. The Zomato and
          Swiggy webhooks are not connected yet, so an order the platform took
          but the till never rang up will not appear here.
        </span>
      </div>

      <div className="card or-filters">
        <div className="field">
          <label>Group table by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <ReportTable
        key={groupBy}
        filename={`online-report-by-${groupBy}`}
        rows={rows}
        loading={loading}
        initialSort={{ key: 'amount', dir: 'desc' }}
        empty={{
          title: 'No online sales in this period',
          sub: 'No bill was settled to Zomato, Swiggy or home delivery.',
        }}
        columns={columns}
      />

      <style>{`
        .or-note {
          display: flex; gap: 9px; align-items: flex-start;
          padding: 11px 14px; border-radius: var(--radius-md);
          background: var(--color-well, #F6F7F9);
          border: 1px solid var(--color-border-soft);
          font-size: 12.5px; line-height: 1.6; color: var(--color-text-muted);
        }
        .or-note svg { flex-shrink: 0; margin-top: 2px; }
        .or-filters {
          display: grid; gap: 14px; align-items: end;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
      `}</style>
    </ReportPage>
  );
}
