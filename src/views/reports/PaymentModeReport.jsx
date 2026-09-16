import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useReportPeriod, useSalesData } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';
import { fmtDate, fmtTime, isoDay } from '../../lib/dates';

/**
 * How the money arrived: cash, card, UPI, and the aggregators.
 *
 * This is the one report that reads bills rather than orders, because the
 * payment mode lives on the bill. A settled session with no bill row therefore
 * cannot be attributed — and rather than hide that, it is counted and shown,
 * since a cash total that silently omits a day's takings is worse than one
 * that admits what it could not see.
 *
 * Clicking a mode opens it day by day, so "Cash · 30 bills" can be checked
 * against each evening's till count rather than taken as one lump.
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

  const [openMode, setOpenMode] = useState(null);

  const { rows, unattributed } = useMemo(() => {
    const byMode = new Map();
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    let paidTotal = 0;

    bills.forEach((b) => {
      if (b.payment_status !== 'paid') return;
      const label = LABELS[(b.payment_method || 'other').toLowerCase()] || 'Other';
      if (!byMode.has(label)) byMode.set(label, { id: label, mode: label, bills: 0, amount: 0, list: [] });
      const r = byMode.get(label);
      const session = sessionById.get(b.session_id);
      r.bills += 1;
      r.amount += Number(b.grand_total) || 0;
      // Dated by the session's close, the same instant the period filter and
      // Day-wise sales use, so a day here reconciles with a day there.
      r.list.push({
        id: b.id,
        at: session?.ended_at || b.paid_at,
        table: session?.restaurant_tables?.table_number,
        customer: session?.customer_name,
        amount: Number(b.grand_total) || 0,
      });
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
        onRowClick={(r) => setOpenMode(r)}
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

      {!loading && rows.length > 0 && (
        <div className="card__subtitle">Click a payment mode to see it day by day.</div>
      )}

      {openMode && <ModeByDay row={openMode} onClose={() => setOpenMode(null)} />}
    </ReportPage>
  );
}

/**
 * One payment mode, one row per day. A day opens to the bills behind it, so a
 * cash day that does not match the till can be traced to the bill that is off.
 */
function ModeByDay({ row, onClose }) {
  const [openDay, setOpenDay] = useState(null);

  const days = useMemo(() => {
    const map = new Map();
    row.list.forEach((b) => {
      const key = b.at ? isoDay(b.at) : 'unknown';
      if (!map.has(key)) map.set(key, { key, bills: [], amount: 0 });
      const d = map.get(key);
      d.bills.push(b);
      d.amount += b.amount;
    });
    return [...map.values()]
      .map((d) => ({
        ...d,
        amount: Math.round(d.amount * 100) / 100,
        bills: d.bills.sort((a, b) => (a.at < b.at ? -1 : 1)),
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [row]);

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer pmd">
        <div className="pmd__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card__title">
              <span className={`pill pill--sm ${TONES[row.mode] || 'tone-neutral'}`}>{row.mode}</span>
            </div>
            <div className="card__subtitle">
              {num(row.bills)} bill{row.bills === 1 ? '' : 's'} · {money(row.amount)} over{' '}
              {days.length} day{days.length === 1 ? '' : 's'}
            </div>
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="pmd__row pmd__row--head">
          <span className="pmd__date">Date</span>
          <span className="pmd__bills">Bills</span>
          <span className="pmd__amt">Collected</span>
        </div>

        {days.map((d) => {
          const open = openDay === d.key;
          return (
            <div key={d.key}>
              <button
                type="button"
                className={`pmd__row pmd__row--btn ${open ? 'on' : ''}`}
                onClick={() => setOpenDay(open ? null : d.key)}
              >
                <span className="pmd__date">
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {d.key === 'unknown' ? 'No date' : fmtDate(d.key)}
                </span>
                <span className="pmd__bills">{num(d.bills.length)}</span>
                <span className="pmd__amt">{money(d.amount)}</span>
              </button>

              {open && d.bills.map((b) => (
                <div key={b.id} className="pmd__bill">
                  <span className="pmd__time">{fmtTime(b.at)}</span>
                  <span className="pmd__who">
                    {b.table ? `Table ${b.table}` : 'No table'}
                    {b.customer && <em>{b.customer}</em>}
                  </span>
                  <span className="pmd__amt">{money(b.amount)}</span>
                </div>
              ))}
            </div>
          );
        })}

        <div className="pmd__row pmd__row--total">
          <span className="pmd__date">Total</span>
          <span className="pmd__bills">{num(row.bills)}</span>
          <span className="pmd__amt">{money(row.amount)}</span>
        </div>

        <style>{`
          .pmd__head {
            display: flex; align-items: flex-start; gap: 12px;
            padding-bottom: 14px; margin-bottom: 6px;
            border-bottom: 1px solid var(--color-border);
          }
          .pmd__row {
            display: flex; align-items: center; gap: 10px; width: 100%;
            padding: 9px 4px; font: inherit; font-size: 13px; text-align: left;
            background: none; border: none; color: var(--color-text);
            border-bottom: 1px solid var(--color-border-soft);
            font-variant-numeric: tabular-nums;
          }
          .pmd__row--head {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.04em; color: var(--color-text-muted);
          }
          .pmd__row--btn { cursor: pointer; }
          .pmd__row--btn:hover, .pmd__row--btn.on { background: var(--color-well, #F6F7F9); }
          .pmd__row--total {
            border-bottom: none; border-top: 2px solid var(--color-border);
            font-weight: 800; margin-top: 2px;
          }
          .pmd__date { flex: 1; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
          .pmd__row--head .pmd__date, .pmd__row--total .pmd__date { padding-left: 20px; }
          .pmd__bills { width: 60px; text-align: right; }
          .pmd__amt { width: 110px; text-align: right; font-weight: 700; }
          .pmd__bill {
            display: flex; align-items: baseline; gap: 10px;
            padding: 6px 4px 6px 24px; font-size: 12.5px;
            border-bottom: 1px solid var(--color-border-soft);
            font-variant-numeric: tabular-nums; color: var(--color-text-soft);
          }
          .pmd__time { width: 48px; flex-shrink: 0; color: var(--color-text-muted); }
          .pmd__who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
          .pmd__who em { font-style: normal; font-size: 11px; color: var(--color-text-faint); }
          .pmd__bill .pmd__amt { font-weight: 600; }
        `}</style>
      </div>
    </>
  );
}
