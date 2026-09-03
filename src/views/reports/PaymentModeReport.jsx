import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';

/**
 * How the money arrived: cash, card, UPI, and the aggregators.
 *
 * This is the one report that reads bills rather than orders, because the
 * payment mode lives on the bill. A settled session with no bill row therefore
 * cannot be attributed — and rather than hide that, it is counted and shown,
 * since a cash total that silently omits a day's takings is worse than one
 * that admits what it could not see.
 */

const LABELS = {
  cash: 'Cash', card: 'Card', upi: 'UPI', qr: 'UPI',
  zomato: 'Zomato', swiggy: 'Swiggy',
  home_delivery: 'Home delivery', other: 'Other',
};

const TONES = {
  Cash: 'tone-green', Card: 'tone-blue', UPI: 'tone-blue',
  Zomato: 'tone-red', Swiggy: 'tone-amber',
  'Home delivery': 'tone-neutral', Other: 'tone-neutral',
};

export default function PaymentModeReport() {
  const periodProps = useReportPeriod();
  const { sessions, bills, summary, loading, error } = useSalesData(periodProps.range);

  const { rows, unattributed } = useMemo(() => {
    const byMode = new Map();
    let paidTotal = 0;

    bills.forEach((b) => {
      if (b.payment_status !== 'paid') return;
      const label = LABELS[(b.payment_method || 'other').toLowerCase()] || 'Other';
      if (!byMode.has(label)) byMode.set(label, { id: label, mode: label, bills: 0, amount: 0 });
      const r = byMode.get(label);
      r.bills += 1;
      r.amount += Number(b.grand_total) || 0;
      paidTotal += Number(b.grand_total) || 0;
    });

    const list = [...byMode.values()].map((r) => ({
      ...r,
      amount: Math.round(r.amount * 100) / 100,
      avg: r.bills ? Math.round((r.amount / r.bills) * 100) / 100 : 0,
      share: paidTotal ? Math.round((r.amount / paidTotal) * 1000) / 10 : 0,
    }));

    // Sessions that were settled but never produced a paid bill row.
    const billed = new Set(bills.filter((b) => b.payment_status === 'paid').map((b) => b.session_id));
    const missing = sessions.filter((s) => !billed.has(s.id));
    const missingValue = missing.reduce((sum, s) =>
      sum + (s.orders || []).reduce((t, o) => t + (Number(o.total) || 0), 0), 0);

    return {
      rows: list,
      unattributed: { count: missing.length, value: Math.round(missingValue * 100) / 100 },
    };
  }, [bills, sessions]);

  const attributed = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <ReportPage
      title="Payment mode report"
      subtitle="How the takings were paid — cash, card, UPI and the aggregators"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Modes used', value: num(rows.length) },
        { label: 'Bills paid', value: num(rows.reduce((s, r) => s + r.bills, 0)) },
        { label: 'Attributed', value: money(attributed) },
        {
          label: 'Sales total',
          value: money(summary.gross),
          tone: Math.abs(summary.gross - attributed) > 0.5 ? 'var(--color-warning)' : undefined,
        },
      ]}
    >
      {!loading && unattributed.count > 0 && (
        <div className="mst-note warn">
          <AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {unattributed.count} settled bill{unattributed.count === 1 ? '' : 's'} worth{' '}
          {money(unattributed.value)} carry no payment record, so they cannot be attributed
          to a mode. They are counted in Sales total but not in Attributed — which is why
          the two differ.
        </div>
      )}

      <ReportTable
        filename="payment-mode-report"
        rows={rows}
        loading={loading}
        initialSort={{ key: 'amount', dir: 'desc' }}
        empty={{
          title: 'No payments recorded',
          sub: 'Payment mode comes from the bill, so a session settled without one shows nothing here.',
        }}
        columns={[
          {
            key: 'mode',
            label: 'Payment mode',
            render: (r) => <span className={`pill pill--sm ${TONES[r.mode] || 'tone-neutral'}`}>{r.mode}</span>,
          },
          { key: 'bills', label: 'Bills', align: 'right', total: true },
          { key: 'avg', label: 'Average bill', align: 'right', render: (r) => money(r.avg) },
          {
            key: 'amount',
            label: 'Collected',
            align: 'right',
            total: true,
            money: true,
            render: (r) => money(r.amount),
          },
          { key: 'share', label: 'Share', align: 'right', render: (r) => `${r.share}%` },
        ]}
      />
    </ReportPage>
  );
}
