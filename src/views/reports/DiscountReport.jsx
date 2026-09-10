import React, { useMemo, useState } from 'react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * Discount Report — every rupee given away at the till.
 *
 * Read off the bills, because that is where a discount is recorded and where
 * it can be tied to a payment mode. A bill with no discount is left out rather
 * than shown as a zero: the report is a list of concessions, and padding it
 * with every full-price bill buries the ones worth looking at.
 *
 * The discount rate here is measured against the bill's own subtotal, so a
 * flat ₹100 off a ₹400 table reads as 25% next to a bill marked 25%.
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

const TYPE_LABEL = { percentage: 'Percentage', flat: 'Flat amount' };

const GROUPINGS = [
  { key: 'bill', label: 'Every discounted bill' },
  { key: 'day', label: 'Day' },
  { key: 'type', label: 'Discount type' },
  { key: 'mode', label: 'Payment mode' },
];

export default function DiscountReport() {
  const periodProps = useReportPeriod('this_month');
  const { sessions, bills, loading, error } = useSalesData(periodProps.range);
  const [groupBy, setGroupBy] = useState('bill');

  const discounted = useMemo(() => {
    const sessionById = new Map((sessions || []).map((s) => [s.id, s]));
    return (bills || [])
      .filter((b) => Number(b.discount_amount) > 0)
      .map((b) => {
        const s = sessionById.get(b.session_id);
        const subtotal = Number(b.subtotal) || 0;
        const discount = Number(b.discount_amount) || 0;
        return {
          id: b.id,
          billNo: `#${String(b.session_id || b.id).slice(0, 4).toUpperCase()}`,
          at: b.paid_at,
          day: dayOf(b.paid_at),
          customer: s?.customer_name || 'Walk-in',
          table: s?.restaurant_tables?.table_number || '—',
          type: TYPE_LABEL[b.discount_type] || 'Unspecified',
          mode: b.payment_method || 'other',
          subtotal: round(subtotal),
          discount: round(discount),
          net: round(Number(b.grand_total) || 0),
          rate: subtotal ? round((discount / subtotal) * 100, 1) : 0,
        };
      })
      .sort((a, b) => b.discount - a.discount);
  }, [bills, sessions]);

  const rows = useMemo(() => {
    if (groupBy === 'bill') return discounted;

    const keyOf = (d) => {
      switch (groupBy) {
        case 'day': return d.day;
        case 'mode': return d.mode;
        default: return d.type;
      }
    };

    const map = new Map();
    discounted.forEach((d) => {
      const k = keyOf(d);
      if (!map.has(k)) {
        map.set(k, {
          id: k, day: d.day, type: d.type, mode: d.mode,
          bills: 0, subtotal: 0, discount: 0, net: 0,
        });
      }
      const r = map.get(k);
      r.bills += 1;
      r.subtotal += d.subtotal;
      r.discount += d.discount;
      r.net += d.net;
    });

    return [...map.values()].map((r) => ({
      ...r,
      subtotal: round(r.subtotal),
      discount: round(r.discount),
      net: round(r.net),
      rate: r.subtotal ? round((r.discount / r.subtotal) * 100, 1) : 0,
    }));
  }, [discounted, groupBy]);

  const totals = useMemo(() => {
    const discount = discounted.reduce((s, d) => s + d.discount, 0);
    const subtotal = discounted.reduce((s, d) => s + d.subtotal, 0);
    // Against all settled bills, not just the discounted ones — that is the
    // number that says what the giveaway cost the business.
    const allPaid = (bills || []).filter((b) => b.payment_status === 'paid');
    const grossAll = allPaid.reduce((s, b) => s + (Number(b.subtotal) || 0), 0);
    return {
      bills: discounted.length,
      paidBills: allPaid.length,
      discount: round(discount),
      rate: subtotal ? round((discount / subtotal) * 100, 1) : 0,
      ofAll: grossAll ? round((discount / grossAll) * 100, 1) : 0,
      biggest: discounted.length ? discounted[0] : null,
    };
  }, [discounted, bills]);

  const columns = useMemo(() => {
    const discountCell = {
      key: 'discount', label: 'Discount', align: 'right', total: true, money: true,
      render: (r) => money(r.discount),
    };
    const rateCell = { key: 'rate', label: 'Rate', align: 'right', render: (r) => `${r.rate}%` };
    const grossCell = {
      key: 'subtotal', label: 'Before discount', align: 'right', total: true, money: true,
      render: (r) => money(r.subtotal),
    };
    const netCell = {
      key: 'net', label: 'Charged', align: 'right', total: true, money: true,
      render: (r) => money(r.net),
    };

    switch (groupBy) {
      case 'day':
        return [
          { key: 'day', label: 'Date', render: (r) => fmtDate(r.day) },
          { key: 'bills', label: 'Bills', align: 'right', total: true },
          grossCell, discountCell, rateCell, netCell,
        ];
      case 'type':
        return [
          { key: 'type', label: 'Discount type' },
          { key: 'bills', label: 'Bills', align: 'right', total: true },
          grossCell, discountCell, rateCell, netCell,
        ];
      case 'mode':
        return [
          { key: 'mode', label: 'Payment mode' },
          { key: 'bills', label: 'Bills', align: 'right', total: true },
          grossCell, discountCell, rateCell, netCell,
        ];
      default:
        return [
          { key: 'billNo', label: 'Bill' },
          { key: 'at', label: 'Settled', render: (r) => fmtDateTime(r.at) },
          { key: 'table', label: 'Table' },
          { key: 'customer', label: 'Customer' },
          { key: 'type', label: 'Type' },
          grossCell, discountCell, rateCell, netCell,
        ];
    }
  }, [groupBy]);

  return (
    <ReportPage
      title="Discount Report"
      subtitle="Every bill settled with a concession, and what it cost"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Discounted bills', value: `${num(totals.bills)} of ${num(totals.paidBills)}` },
        { label: 'Total discount', value: money(totals.discount), tone: 'var(--color-danger)' },
        { label: 'Avg rate given', value: `${totals.rate}%` },
        { label: 'Of all takings', value: `${totals.ofAll}%` },
        { label: 'Largest', value: totals.biggest ? money(totals.biggest.discount) : '—' },
      ]}
    >
      <div className="card dr-filters">
        <div className="field">
          <label>Group table by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <ReportTable
        key={groupBy}
        filename={`discount-report-by-${groupBy}`}
        rows={rows}
        loading={loading}
        initialSort={{ key: 'discount', dir: 'desc' }}
        empty={{
          title: 'No discounts in this period',
          sub: 'Every bill was settled at full price.',
        }}
        columns={columns}
      />

      <style>{`
        .dr-filters {
          display: grid; gap: 14px; align-items: end;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
      `}</style>
    </ReportPage>
  );
}
