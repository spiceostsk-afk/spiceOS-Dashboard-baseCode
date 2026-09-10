import React, { useMemo } from 'react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * One row per day: the sales register a manager reconciles the till against.
 *
 * Days with no trade are included as zeroes rather than skipped. A gap in a
 * register is ambiguous — closed, or forgotten? — and an explicit zero is not.
 */

const localKey = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};


export default function DayWiseSales() {
  const periodProps = useReportPeriod('this_month');
  const { sessions, summary, loading, error } = useSalesData(periodProps.range);

  const rows = useMemo(() => {
    const byDay = new Map();

    // Seed every day in the range so a quiet day reads zero rather than vanishing.
    const cur = new Date(periodProps.range.from);
    const last = new Date(periodProps.range.to);
    let guard = 0;
    while (cur <= last && guard < 400) {
      const k = localKey(cur);
      byDay.set(k, { id: k, day: k, label: fmtDate(k), bills: 0, qty: 0, gross: 0, tax: 0 });
      cur.setDate(cur.getDate() + 1);
      guard += 1;
    }

    sessions.forEach((s) => {
      const k = localKey(new Date(s.ended_at));
      if (!byDay.has(k)) {
        byDay.set(k, { id: k, day: k, label: fmtDate(k), bills: 0, qty: 0, gross: 0, tax: 0 });
      }
      const r = byDay.get(k);
      r.bills += 1;
      (s.orders || []).forEach((o) => {
        if (o.order_status === 'cancelled') return;
        r.gross += Number(o.total) || 0;
        r.tax += Number(o.tax) || 0;
        (o.order_items || []).forEach((oi) => {
          if (!oi.is_cancelled) r.qty += Number(oi.quantity) || 0;
        });
      });
    });

    return [...byDay.values()].map((r) => ({
      ...r,
      gross: Math.round(r.gross * 100) / 100,
      tax: Math.round(r.tax * 100) / 100,
      net: Math.round((r.gross - r.tax) * 100) / 100,
      avg: r.bills ? Math.round((r.gross / r.bills) * 100) / 100 : 0,
    }));
  }, [sessions, periodProps.range]);

  const trading = rows.filter((r) => r.bills > 0);
  const busiest = trading.reduce((a, b) => (b.gross > (a?.gross ?? -1) ? b : a), null);

  return (
    <ReportPage
      title="Day-wise sales"
      subtitle="One row per day — the register to reconcile the till against"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Days trading', value: `${num(trading.length)} of ${num(rows.length)}` },
        { label: 'Bills', value: num(summary.bills) },
        { label: 'Gross', value: money(summary.gross) },
        { label: 'Best day', value: busiest ? busiest.label : '—' },
      ]}
    >
      <ReportTable
        filename="day-wise-sales"
        rows={rows}
        loading={loading}
        initialSort={{ key: 'day', dir: 'desc' }}
        empty={{ title: 'No days in this range', sub: 'Pick a wider period.' }}
        columns={[
          { key: 'day', label: 'Date', render: (r) => r.label },
          { key: 'bills', label: 'Bills', align: 'right', total: true },
          { key: 'qty', label: 'Items', align: 'right', total: true },
          { key: 'avg', label: 'Avg bill', align: 'right', render: (r) => money(r.avg) },
          {
            key: 'tax', label: 'Tax', align: 'right', total: true, money: true,
            render: (r) => money(r.tax),
          },
          {
            key: 'net', label: 'Net', align: 'right', total: true, money: true,
            render: (r) => money(r.net),
          },
          {
            key: 'gross', label: 'Gross', align: 'right', total: true, money: true,
            render: (r) => (
              <strong style={{ color: r.gross > 0 ? 'var(--color-text)' : 'var(--color-text-faint)' }}>
                {money(r.gross)}
              </strong>
            ),
          },
        ]}
      />
    </ReportPage>
  );
}
