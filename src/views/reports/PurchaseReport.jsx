import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronRight, ChevronDown, Check, Search, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useReportPeriod } from '../../hooks/useSalesReports';
import { ReportPage, ReportTable, money, num } from './ReportShell';

/**
 * Item Purchase Report — what was bought, of what, from whom, on which day.
 *
 * The report is built from purchase LINES rather than invoices, because the
 * question a kitchen actually asks is "what did we pay for onions this month",
 * and an invoice total cannot answer it. Lines are then grouped by whichever
 * dimension is being asked about; the by-supplier view is one of those
 * groupings rather than the only shape available.
 *
 * Every row opens into the invoices behind it. A total nobody can break down
 * is a number to argue about rather than reconcile.
 *
 * Only POSTED purchases count. A draft has not arrived and has moved no stock,
 * so including it would overstate spend against goods that are not there.
 *
 * One caveat worth knowing: the money here is the sum of LINE amounts, which
 * is what was paid for goods. Invoice-level tax and discount are not spread
 * back across the lines — they belong to the invoice, and are shown there.
 */

const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
});

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

/** Quantities are stock, not currency — trailing zeros are noise. */
const qtyLabel = (n) => {
  const v = round(n, 3);
  return Number.isInteger(v) ? num(v) : String(v);
};

const GROUPINGS = [
  { key: 'date', label: 'Date' },
  { key: 'item', label: 'Inventory item' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'invoice', label: 'Invoice' },
];

/* ------------------------------------------------------------ multi-select */
/**
 * A picker that defaults to "everything".
 *
 * An empty selection means no filter rather than no rows: opening a report and
 * being shown nothing until you tick something is a worse first screen than
 * being shown the lot.
 */
function MultiPicker({ label, allLabel, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  return (
    <div className="field pf-pick" ref={box}>
      <label>{label}</label>
      <button type="button" className="pf-pick__btn" onClick={() => setOpen((o) => !o)}>
        <span className={selected.size ? '' : 'muted'}>
          {selected.size === 0 ? allLabel : `${selected.size} of ${options.length} selected`}
        </span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="pf-pop">
          <div className="pf-pop__search">
            <Search size={13} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
              autoFocus
            />
          </div>

          <div className="pf-pop__acts">
            <button type="button" onClick={() => onChange(new Set())}>All</button>
            <button type="button" onClick={() => onChange(new Set(shown.map((o) => o.id)))}>
              Select shown
            </button>
          </div>

          <div className="pf-pop__list">
            {shown.length === 0 && <div className="pf-pop__none">Nothing matches</div>}
            {shown.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`pf-opt ${selected.has(o.id) ? 'on' : ''}`}
                onClick={() => toggle(o.id)}
              >
                <span className="pf-opt__box">{selected.has(o.id) && <Check size={11} />}</span>
                <span className="pf-opt__name">{o.name}</span>
                {o.sub && <span className="pf-opt__sub">{o.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PurchaseReport() {
  const periodProps = useReportPeriod('this_month');
  const { range } = periodProps;

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [vendorIds, setVendorIds] = useState(() => new Set());
  const [itemIds, setItemIds] = useState(() => new Set());
  const [groupBy, setGroupBy] = useState('date');
  const [text, setText] = useState({ date: '', item: '', vendor: '' });
  const [openRow, setOpenRow] = useState(null);

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
            id, inventory_item_id, qty, entry_unit, qty_base, rate, tax_pct, amount,
            inventory_items ( item_name, unit, purchase_unit, barcode, category,
                              inventory_categories ( name ) )
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

  /** One row per purchase line — everything below is a grouping of these. */
  const lines = useMemo(() => purchases.flatMap((p) => (p.purchase_items || []).map((l) => {
    const item = l.inventory_items || {};
    return {
      lineId: l.id,
      purchase: p,
      date: p.invoice_date,
      invoiceId: p.id,
      invoiceNo: p.invoice_no || 'No invoice number',
      vendorId: p.vendors?.id || 'none',
      vendor: p.vendors?.name || 'No vendor',
      itemId: l.inventory_item_id || 'none',
      itemName: item.item_name || 'Unknown item',
      unit: item.unit || '',
      barcode: item.barcode || '',
      category: item.inventory_categories?.name || item.category || '',
      qtyBase: Number(l.qty_base) || 0,
      amount: Number(l.amount) || 0,
    };
  })), [purchases]);

  /** The pickers list what is actually in the period, not the whole master. */
  const vendorOptions = useMemo(() => {
    const seen = new Map();
    lines.forEach((l) => seen.set(l.vendorId, l.vendor));
    return [...seen]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lines]);

  const itemOptions = useMemo(() => {
    const seen = new Map();
    lines.forEach((l) => seen.set(l.itemId, { name: l.itemName, sub: l.category }));
    return [...seen]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lines]);

  const filtered = useMemo(() => {
    const d = text.date.trim().toLowerCase();
    const i = text.item.trim().toLowerCase();
    const v = text.vendor.trim().toLowerCase();
    return lines.filter((l) => {
      if (vendorIds.size && !vendorIds.has(l.vendorId)) return false;
      if (itemIds.size && !itemIds.has(l.itemId)) return false;
      if (d && !dayLabel(l.date).toLowerCase().includes(d)) return false;
      if (i && !`${l.itemName} ${l.barcode} ${l.category}`.toLowerCase().includes(i)) return false;
      if (v && !l.vendor.toLowerCase().includes(v)) return false;
      return true;
    });
  }, [lines, vendorIds, itemIds, text]);

  /**
   * Grouping.
   *
   * "Date" means a row per day, item and vendor — the daily item purchases the
   * report is named for. The other three collapse further, and a row always
   * keeps the lines behind it so it can be opened.
   */
  const rows = useMemo(() => {
    const keyOf = (l) => {
      switch (groupBy) {
        case 'item': return l.itemId;
        case 'vendor': return l.vendorId;
        case 'invoice': return l.invoiceId;
        default: return `${l.date}|${l.itemId}|${l.vendorId}`;
      }
    };

    const map = new Map();
    filtered.forEach((l) => {
      const k = keyOf(l);
      if (!map.has(k)) {
        map.set(k, {
          id: k,
          date: l.date,
          itemName: l.itemName,
          barcode: l.barcode,
          category: l.category,
          vendor: l.vendor,
          invoiceNo: l.invoiceNo,
          qty: 0,
          amount: 0,
          units: new Set(),
          items: new Set(),
          vendors: new Set(),
          invoices: new Set(),
          lastOn: null,
          lines: [],
        });
      }
      const r = map.get(k);
      r.qty += l.qtyBase;
      r.amount += l.amount;
      if (l.unit) r.units.add(l.unit);
      r.items.add(l.itemId);
      r.vendors.add(l.vendorId);
      r.invoices.add(l.invoiceId);
      if (!r.lastOn || l.date > r.lastOn) r.lastOn = l.date;
      r.lines.push(l);
    });

    const grand = [...map.values()].reduce((s, r) => s + r.amount, 0);
    return [...map.values()].map((r) => ({
      ...r,
      qty: round(r.qty, 3),
      amount: round(r.amount),
      // Only label a quantity with a unit when the whole row is in that unit.
      // "43 Kg" against a row that is part kilos and part pieces is a lie.
      unit: r.units.size === 1 ? [...r.units][0] : '',
      itemCount: r.items.size,
      vendorCount: r.vendors.size,
      invoiceCount: r.invoices.size,
      // Weighted average, not the average of the rates: buying 100 kg at ₹40
      // and 1 kg at ₹400 did not cost ₹220 a kilo.
      unitCost: r.qty ? round(r.amount / r.qty) : 0,
      share: grand ? round((r.amount / grand) * 100, 1) : 0,
    }));
  }, [filtered, groupBy]);

  const totals = useMemo(() => {
    const qty = filtered.reduce((s, l) => s + l.qtyBase, 0);
    const amount = filtered.reduce((s, l) => s + l.amount, 0);
    return {
      items: new Set(filtered.map((l) => l.itemId)).size,
      vendors: new Set(filtered.map((l) => l.vendorId)).size,
      invoices: new Set(filtered.map((l) => l.invoiceId)).size,
      qty: round(qty, 3),
      amount: round(amount),
      unitCost: qty ? round(amount / qty) : 0,
    };
  }, [filtered]);

  /* -------------------------------------------------------------- columns */
  const columns = useMemo(() => {
    const itemCell = (withArrow) => ({
      key: 'itemName',
      label: 'Inventory item',
      render: (r) => (
        <span className="pr-item">
          <span className="pr-item__name">
            {r.itemName}{withArrow && <ChevronRight size={13} />}
          </span>
          {(r.barcode || r.category) && (
            <span className="pr-item__sub">
              {[r.barcode, r.category].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      ),
    });

    const purchased = {
      key: 'qty',
      label: 'Purchased',
      align: 'right',
      total: true,
      render: (r) => `${qtyLabel(r.qty)}${r.unit ? ` ${r.unit}` : ''}`,
    };
    const unitCost = {
      key: 'unitCost', label: 'Unit cost', align: 'right', render: (r) => money(r.unitCost),
    };
    const amount = {
      key: 'amount', label: 'Total', align: 'right', total: true, money: true,
      render: (r) => money(r.amount),
    };
    const share = {
      key: 'share', label: 'Share', align: 'right', render: (r) => `${r.share}%`,
    };

    switch (groupBy) {
      case 'item':
        return [
          itemCell(true),
          { key: 'vendorCount', label: 'Vendors', align: 'right' },
          { key: 'invoiceCount', label: 'Invoices', align: 'right', total: true },
          { key: 'lastOn', label: 'Last bought', align: 'right', render: (r) => dayLabel(r.lastOn) },
          purchased, unitCost, amount, share,
        ];

      case 'vendor':
        return [
          {
            key: 'vendor',
            label: 'Vendor',
            render: (r) => <span className="pr-vendor">{r.vendor} <ChevronRight size={13} /></span>,
          },
          { key: 'itemCount', label: 'Items', align: 'right' },
          { key: 'invoiceCount', label: 'Invoices', align: 'right', total: true },
          { key: 'lastOn', label: 'Last invoice', align: 'right', render: (r) => dayLabel(r.lastOn) },
          // No unit cost here: a supplier's kilos and pieces added together
          // divide into a number that means nothing.
          purchased, amount, share,
        ];

      case 'invoice':
        return [
          {
            key: 'invoiceNo',
            label: 'Invoice',
            render: (r) => (
              <span className="pr-vendor">{r.invoiceNo} <ChevronRight size={13} /></span>
            ),
          },
          { key: 'date', label: 'Date', render: (r) => dayLabel(r.date) },
          { key: 'vendor', label: 'Vendor' },
          { key: 'itemCount', label: 'Lines', align: 'right', total: true },
          purchased, amount,
        ];

      default:
        return [
          { key: 'date', label: 'Date', render: (r) => dayLabel(r.date) },
          itemCell(true),
          { key: 'vendor', label: 'Vendor' },
          {
            key: 'invoiceCount',
            label: 'Invoices',
            render: (r) => (
              <span className="pr-grns">
                {[...new Set(r.lines.map((l) => l.invoiceNo))].slice(0, 3).map((n) => (
                  <span key={n} className="pr-grn">{n}</span>
                ))}
                {r.invoiceCount > 3 && <span className="pr-grn">+{r.invoiceCount - 3}</span>}
              </span>
            ),
          },
          purchased, unitCost, amount,
        ];
    }
  }, [groupBy]);

  const grouping = GROUPINGS.find((g) => g.key === groupBy);
  const dirty = vendorIds.size > 0 || itemIds.size > 0
    || text.date !== '' || text.item !== '' || text.vendor !== '';

  return (
    <ReportPage
      title="Item Purchase Report"
      subtitle="Daily inventory purchases from posted purchase invoices"
      periodProps={periodProps}
      loading={loading}
      error={error}
      actions={(
        <button className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'pr-spin' : ''} /> Refresh
        </button>
      )}
      cards={[
        { label: 'Items', value: num(totals.items) },
        { label: 'Quantity', value: qtyLabel(totals.qty) },
        { label: 'Purchase value', value: money(totals.amount) },
        { label: 'Avg unit cost', value: money(totals.unitCost) },
        { label: 'Invoices / vendors', value: `${num(totals.invoices)} / ${num(totals.vendors)}` },
      ]}
    >
      {/* ------------------------------------------------------------ filters */}
      <div className="card pf">
        <MultiPicker
          label="Vendors"
          allLabel="All vendors"
          options={vendorOptions}
          selected={vendorIds}
          onChange={setVendorIds}
        />
        <MultiPicker
          label="Inventory items"
          allLabel="All items"
          options={itemOptions}
          selected={itemIds}
          onChange={setItemIds}
        />
        <div className="field">
          <label>Group table by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
        {dirty && (
          <button
            className="btn btn--ghost btn--sm pf__clear"
            onClick={() => {
              setVendorIds(new Set());
              setItemIds(new Set());
              setText({ date: '', item: '', vendor: '' });
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ------------------------------------------------- narrow the table */}
      <div className="card pf">
        <div className="field">
          <label>Date</label>
          <input
            value={text.date}
            onChange={(e) => setText({ ...text, date: e.target.value })}
            placeholder="Filter table dates"
          />
        </div>
        <div className="field">
          <label>Inventory item</label>
          <input
            value={text.item}
            onChange={(e) => setText({ ...text, item: e.target.value })}
            placeholder="Filter table items"
          />
        </div>
        <div className="field">
          <label>Vendor</label>
          <input
            value={text.vendor}
            onChange={(e) => setText({ ...text, vendor: e.target.value })}
            placeholder="Filter table vendors"
          />
        </div>
      </div>

      <div className="card__subtitle pr-count">
        {grouping.label} view · {num(rows.length)} grouped purchase row
        {rows.length === 1 ? '' : 's'} from {num(filtered.length)} line
        {filtered.length === 1 ? '' : 's'}
      </div>

      <ReportTable
        key={groupBy}
        filename={`purchase-report-by-${groupBy}`}
        rows={rows}
        loading={loading}
        onRowClick={(r) => setOpenRow(r)}
        initialSort={{ key: groupBy === 'date' ? 'date' : 'amount', dir: 'desc' }}
        empty={{
          title: 'No purchases in this period',
          sub: 'Only posted invoices count — a draft has not arrived and has moved no stock.',
        }}
        columns={columns}
      />

      {openRow && (
        <RowInvoices row={openRow} groupBy={groupBy} onClose={() => setOpenRow(null)} />
      )}

      <style>{`
        .pf {
          display: grid; gap: 14px; align-items: end;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .pf__clear { align-self: end; justify-self: start; }
        .pr-count { margin-top: -4px; }
        .pr-spin { animation: pr-spin 0.9s linear infinite; }
        @keyframes pr-spin { to { transform: rotate(360deg); } }

        .pf-pick { position: relative; }
        .pf-pick__btn {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          width: 100%; height: 38px; padding: 0 11px; font: inherit; font-size: 13px;
          text-align: left; cursor: pointer;
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          background: var(--color-surface); color: var(--color-text);
        }
        .pf-pick__btn:hover { border-color: var(--color-border-strong, #C7CBD1); }
        .pf-pick__btn .muted { color: var(--color-text-muted); }
        .pf-pick__btn svg { flex-shrink: 0; color: var(--color-text-faint); }

        .pf-pop {
          position: absolute; z-index: 20; top: calc(100% + 5px); left: 0; right: 0;
          min-width: 240px; max-height: 320px; display: flex; flex-direction: column;
          background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: var(--radius-md); box-shadow: 0 12px 28px rgba(16, 24, 40, 0.14);
        }
        .pf-pop__search {
          display: flex; align-items: center; gap: 7px; padding: 9px 11px;
          border-bottom: 1px solid var(--color-border-soft);
          color: var(--color-text-faint);
        }
        .pf-pop__search input {
          flex: 1; min-width: 0; border: none; outline: none; background: none;
          font: inherit; font-size: 13px; color: var(--color-text);
        }
        .pf-pop__acts {
          display: flex; gap: 6px; padding: 7px 9px;
          border-bottom: 1px solid var(--color-border-soft);
        }
        .pf-pop__acts button {
          border: none; background: none; cursor: pointer; padding: 3px 6px;
          font: inherit; font-size: 11.5px; font-weight: 700; border-radius: 5px;
          color: var(--color-info, #2563EB);
        }
        .pf-pop__acts button:hover { background: var(--color-info-soft, #EAF1FE); }
        .pf-pop__list { overflow-y: auto; padding: 5px; }
        .pf-pop__none {
          padding: 14px; text-align: center; font-size: 12.5px;
          color: var(--color-text-muted);
        }
        .pf-opt {
          display: flex; align-items: center; gap: 9px; width: 100%;
          padding: 7px 8px; border: none; background: none; cursor: pointer;
          font: inherit; font-size: 13px; text-align: left; border-radius: 6px;
          color: var(--color-text);
        }
        .pf-opt:hover { background: var(--color-well, #F6F7F9); }
        .pf-opt__box {
          flex-shrink: 0; width: 15px; height: 15px; display: grid; place-items: center;
          border: 1px solid var(--color-border-strong, #C7CBD1); border-radius: 4px;
          color: #fff;
        }
        .pf-opt.on .pf-opt__box {
          background: var(--color-info, #2563EB); border-color: var(--color-info, #2563EB);
        }
        .pf-opt__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .pf-opt__sub { font-size: 11px; color: var(--color-text-muted); white-space: nowrap; }

        .pr-item { display: flex; flex-direction: column; gap: 1px; }
        .pr-item__name {
          display: inline-flex; align-items: center; gap: 5px;
          font-weight: 600; color: var(--color-text);
        }
        .pr-item__name svg { color: var(--color-text-faint); }
        .pr-item__sub { font-size: 11.5px; color: var(--color-text-muted); }
        .pr-vendor {
          display: inline-flex; align-items: center; gap: 5px;
          font-weight: 600; color: var(--color-text);
        }
        .pr-vendor svg { color: var(--color-text-faint); }
        .pr-grns { display: inline-flex; flex-wrap: wrap; gap: 4px; }
        .pr-grn {
          padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 600;
          background: var(--color-well, #F6F7F9); color: var(--color-text-muted);
          border: 1px solid var(--color-border-soft);
        }
      `}</style>
    </ReportPage>
  );
}

/* --------------------------------------------------- one row, broken down */
/**
 * The invoices behind whatever was clicked. Grouping changes what a row means,
 * so the drawer restates it rather than assuming the reader remembers.
 */
function RowInvoices({ row, groupBy, onClose }) {
  const invoices = useMemo(() => {
    const seen = new Map();
    row.lines.forEach((l) => { if (!seen.has(l.invoiceId)) seen.set(l.invoiceId, l.purchase); });
    return [...seen.values()].sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1));
  }, [row]);

  const heading = {
    item: row.itemName,
    vendor: row.vendor,
    invoice: row.invoiceNo,
  }[groupBy] || `${row.itemName} · ${row.vendor}`;

  const sub = groupBy === 'date' ? dayLabel(row.date) : null;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer drawer--wide pri">
        <div className="pri__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card__title">{heading}</div>
            <div className="card__subtitle">
              {sub && <>{sub} · </>}
              {qtyLabel(row.qty)}{row.unit ? ` ${row.unit}` : ''} · {money(row.amount)} across{' '}
              {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'}
            </div>
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        {invoices.map((p) => (
          <div key={p.id} className="pri__inv">
            <div className="pri__inv-head">
              <div>
                <strong>{p.invoice_no || 'No invoice number'}</strong>
                <div className="card__subtitle">
                  {dayLabel(p.invoice_date)} · {p.vendors?.name || 'No vendor'}
                </div>
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

            {(Number(p.tax_amount) > 0 || Number(p.discount) > 0) && (
              <div className="pri__note">
                {Number(p.tax_amount) > 0 && <>Tax {money(p.tax_amount)}</>}
                {Number(p.tax_amount) > 0 && Number(p.discount) > 0 && ' · '}
                {Number(p.discount) > 0 && <>Discount {money(p.discount)}</>}
              </div>
            )}
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
