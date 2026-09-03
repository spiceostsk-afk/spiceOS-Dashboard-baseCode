import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useReportPeriod } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';

/**
 * What was bought, from whom, over a period — and what made up each total.
 *
 * The list answers "how much did we spend with each supplier this month"; the
 * drill-down answers the question that always follows, "on what, on which
 * dates, against which invoices". A supplier total nobody can break down is a
 * number to argue about rather than reconcile.
 *
 * Only POSTED purchases count. A draft has not arrived and has moved no stock,
 * so including it would overstate spend against goods that are not there.
 */

const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
});

export default function PurchaseReport() {
  const periodProps = useReportPeriod('this_month');
  const { range } = periodProps;

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openVendor, setOpenVendor] = useState(null);

  const fromDay = range.from.toISOString().slice(0, 10);
  const toDay = range.to.toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from('purchases')
        .select(`
          id, invoice_no, invoice_date, status, subtotal, tax_amount, discount, total, note,
          vendors ( id, name ),
          purchase_items (
            id, qty, entry_unit, qty_base, rate, tax_pct, amount,
            inventory_items ( item_name, unit, purchase_unit )
          )
        `)
        .eq('status', 'posted')
        .gte('invoice_date', fromDay)
        .lte('invoice_date', toDay)
        .order('invoice_date', { ascending: false });

      if (qErr) throw qErr;
      setPurchases(data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading purchase report:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDay, toDay]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const byVendor = new Map();
    purchases.forEach((p) => {
      const id = p.vendors?.id || 'none';
      if (!byVendor.has(id)) {
        byVendor.set(id, {
          id,
          vendor: p.vendors?.name || 'No vendor',
          invoices: 0,
          items: 0,
          qty: 0,
          amount: 0,
          lastOn: null,
          purchases: [],
        });
      }
      const r = byVendor.get(id);
      r.invoices += 1;
      r.amount += Number(p.total) || 0;
      r.items += (p.purchase_items || []).length;
      r.qty += (p.purchase_items || []).reduce((s, l) => s + (Number(l.qty_base) || 0), 0);
      if (!r.lastOn || p.invoice_date > r.lastOn) r.lastOn = p.invoice_date;
      r.purchases.push(p);
    });

    const total = [...byVendor.values()].reduce((s, r) => s + r.amount, 0);
    return [...byVendor.values()].map((r) => ({
      ...r,
      amount: Math.round(r.amount * 100) / 100,
      qty: Math.round(r.qty * 1000) / 1000,
      share: total ? Math.round((r.amount / total) * 1000) / 10 : 0,
    }));
  }, [purchases]);

  const spend = rows.reduce((s, r) => s + r.amount, 0);
  const biggest = rows.reduce((a, b) => (b.amount > (a?.amount ?? -1) ? b : a), null);

  return (
    <ReportPage
      title="Purchase report"
      subtitle="What was bought and from whom — click a supplier for its invoices"
      periodProps={periodProps}
      loading={loading}
      error={error}
      cards={[
        { label: 'Suppliers', value: num(rows.length) },
        { label: 'Invoices', value: num(purchases.length) },
        { label: 'Total spend', value: money(spend) },
        { label: 'Largest supplier', value: biggest ? biggest.vendor : '—' },
      ]}
    >
      <ReportTable
        filename="purchase-report-by-vendor"
        rows={rows}
        loading={loading}
        onRowClick={(r) => setOpenVendor(r)}
        initialSort={{ key: 'amount', dir: 'desc' }}
        empty={{
          title: 'No purchases in this period',
          sub: 'Only posted invoices count — a draft has not arrived and has moved no stock.',
        }}
        columns={[
          {
            key: 'vendor',
            label: 'Supplier',
            render: (r) => (
              <span className="pr-vendor">
                {r.vendor} <ChevronRight size={13} />
              </span>
            ),
          },
          { key: 'invoices', label: 'Invoices', align: 'right', total: true },
          { key: 'items', label: 'Lines', align: 'right', total: true },
          { key: 'qty', label: 'Qty (base units)', align: 'right', total: true },
          { key: 'lastOn', label: 'Last invoice', align: 'right', render: (r) => dayLabel(r.lastOn) },
          {
            key: 'amount', label: 'Spend', align: 'right', total: true, money: true,
            render: (r) => money(r.amount),
          },
          { key: 'share', label: 'Share', align: 'right', render: (r) => `${r.share}%` },
        ]}
      />

      {openVendor && (
        <VendorInvoices vendor={openVendor} onClose={() => setOpenVendor(null)} />
      )}

      <style>{`
        .pr-vendor {
          display: inline-flex; align-items: center; gap: 5px;
          font-weight: 600; color: var(--color-text);
        }
        .pr-vendor svg { color: var(--color-text-faint); }
      `}</style>
    </ReportPage>
  );
}

/* ------------------------------------------------- one supplier, broken down */
function VendorInvoices({ vendor, onClose }) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer drawer--wide pri">
        <div className="pri__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card__title">{vendor.vendor}</div>
            <div className="card__subtitle">
              {vendor.invoices} invoice{vendor.invoices === 1 ? '' : 's'} · {money(vendor.amount)}
            </div>
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        {vendor.purchases
          .slice()
          .sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1))
          .map((p) => (
            <div key={p.id} className="pri__inv">
              <div className="pri__inv-head">
                <div>
                  <strong>{p.invoice_no || 'No invoice number'}</strong>
                  <div className="card__subtitle">{dayLabel(p.invoice_date)}</div>
                </div>
                <div className="pri__inv-total">{money(p.total)}</div>
              </div>

              {(p.purchase_items || []).map((l) => {
                const item = l.inventory_items || {};
                const entryUnit = l.entry_unit === 'purchase'
                  ? (item.purchase_unit || item.unit)
                  : item.unit;
                return (
                  <div key={l.id} className="pri__line">
                    <span className="pri__name">{item.item_name || 'Item'}</span>
                    <span className="pri__qty">
                      {l.qty} {entryUnit}
                      {l.entry_unit === 'purchase' && (
                        <em> → {l.qty_base} {item.unit}</em>
                      )}
                    </span>
                    <span className="pri__rate">@ {money(l.rate)}</span>
                    <span className="pri__amt">{money(l.amount)}</span>
                  </div>
                );
              })}

              {p.note && <div className="pri__note">{p.note}</div>}
            </div>
          ))}

        <style>{`
          .drawer--wide { width: 580px; }
          .pri__head {
            display: flex; align-items: flex-start; gap: 12px;
            padding-bottom: 14px; border-bottom: 1px solid var(--color-border);
          }
          .pri__inv {
            padding: 14px 0; border-bottom: 1px solid var(--color-border-soft);
          }
          .pri__inv-head {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 12px; margin-bottom: 8px;
          }
          .pri__inv-total { font-size: 15px; font-weight: 800; }
          .pri__line {
            display: flex; align-items: baseline; gap: 10px;
            padding: 4px 0; font-size: 12.5px;
          }
          .pri__name { flex: 1.6; min-width: 0; font-weight: 600; }
          .pri__qty { flex: 1.2; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
          .pri__qty em { font-style: normal; color: var(--color-text-faint); }
          .pri__rate { width: 92px; text-align: right; color: var(--color-text-muted); }
          .pri__amt { width: 92px; text-align: right; font-weight: 700; }
          .pri__note { margin-top: 6px; font-size: 12px; color: var(--color-text-muted); }
        `}</style>
      </div>
    </>
  );
}
