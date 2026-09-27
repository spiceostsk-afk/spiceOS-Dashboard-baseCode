import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Calendar, Receipt, AlertTriangle, CheckCircle2, ClipboardList, X,
} from 'lucide-react';
import SearchSelect from '../../components/SearchSelect';
import { useSalesEntry, HISTORY_PAGE_SIZE } from '../../hooks/useSalesEntry';
import { useOutlet } from '../../context/OutletContext';
import { MastersStyles, Pager } from '../masters/mastersUi';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * Sales for a day that has already passed.
 *
 * Two ways in, because two things get asked for. A day sheet is for catching
 * up — one line per dish, the whole day's quantity, saved as a single sale. An
 * individual order is for reconstructing a particular bill, with its own time
 * and table.
 *
 * Both write the same thing: a completed session, an order, its items and a
 * paid bill, all stamped with the chosen moment. That timestamp is what puts
 * the revenue in the right day's report AND takes the ingredients out of the
 * right day's stock — the two used to disagree, because consumption was dated
 * when it was typed rather than when it was sold.
 */

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};


let seq = 0;
const blankLine = () => ({ key: `s${(seq += 1)}`, menuItemId: '', quantity: '', price: '' });

export default function SalesEntry() {
  const {
    dishes, tables, recent, recentTotal, recentPage, setRecentPage,
    taxPct, loading, error, recordSale, priceLines, loadEntry,
  } = useSalesEntry();
  const { outlet, isMultiOutlet } = useOutlet();

  const [mode, setMode] = useState('day');          // 'day' | 'order'
  const [date, setDate] = useState(yesterday);
  const [time, setTime] = useState('20:00');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [openEntryId, setOpenEntryId] = useState(null);

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 6000);
  };

  const sellable = useMemo(
    () => dishes.filter((d) => d.is_available !== false),
    [dishes],
  );
  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  const chosen = lines.map((l) => l.menuItemId).filter(Boolean);
  const totals = priceLines(lines);
  const filled = lines.filter((l) => l.menuItemId && Number(l.quantity) > 0).length;

  const setLine = (key, patch) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key) =>
    setLines((prev) => (prev.length === 1 ? [blankLine()] : prev.filter((l) => l.key !== key)));

  const reset = () => {
    setLines([blankLine()]);
    setCustomerName('');
    setNote('');
  };

  const submit = async () => {
    setSaving(true);
    const res = await recordSale({
      date,
      // A day sheet is one consolidated sale; close of business is the honest
      // moment to book it at, since it covers the whole day.
      time: mode === 'day' ? '21:00' : time,
      lines,
      // A day sheet is the whole day consolidated, not one table's bill.
      // Sending a table here is what put fourteen day totals on G1-G4 and
      // P1-P4 as though someone had sat there.
      tableId: mode === 'day' ? '' : tableId,
      customerName: mode === 'day' ? 'Day total' : (customerName || 'Walk-in'),
      paymentMethod,
      note: mode === 'day' ? `Day sheet for ${fmtDate(date)}` : note,
    });
    setSaving(false);

    if (res.success) {
      const r = res.result || {};
      flash(
        `Recorded ${r.lines} dish${r.lines === 1 ? '' : 'es'} on ${fmtDate(date)} `
        + `— ${money(r.total)}. Stock for that day has been reduced.`,
      );
      reset();
    } else {
      flash(res.error || 'Could not record the sale.', 'bad');
    }
  };

  return (
    <div className="page">
      <div className="mst-top">
        <div>
          <h2 className="mst-title">Sales Entry</h2>
          <div className="card__subtitle">
            Record sales for a day that has already passed
            {isMultiOutlet && outlet ? ` · ${outlet.name}` : ''}
          </div>
        </div>
        <div className="segmented">
          <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>
            Day total
          </button>
          <button className={mode === 'order' ? 'on' : ''} onClick={() => setMode('order')}>
            Individual order
          </button>
        </div>
      </div>

      {notice && (
        <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>
      )}
      {error && <div className="mst-note bad">{error}</div>}

      {!loading && tables.length === 0 && (
        <div className="mst-note warn">
          <AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          This restaurant has no tables yet. A sale is recorded against a table, so add
          one under QR Codes before entering past sales.
        </div>
      )}

      {!loading && sellable.length === 0 && (
        <div className="mst-note warn">
          <AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          No dishes are available to sell. Add them in Menu Catalog first.
        </div>
      )}

      <div className="se-explain">
        {mode === 'day'
          ? 'One line per dish with the whole day’s quantity, saved as a single sale booked at close of business. It is not recorded against any one table.'
          : 'Recreate one bill with its own time and table. Save, then enter the next.'}
        {' '}
        The date you choose is what the revenue reports against and what the stock comes
        out of — both land on that day, not today.
      </div>

      {/* ------------------------------------------------------------ when */}
      <div className="card mst-filters">
        <div className="field">
          <label>Date sold</label>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {mode === 'order' && (
          <div className="field">
            <label>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        )}

        {mode === 'order' && (
          <div className="field">
            <label>Table</label>
            {/* Left blank, the sale lands on the restaurant's first table —
                a session cannot exist without one. It is a placeholder, not a
                seating record, so it is only offered where a real table is
                being recreated. */}
            <SearchSelect
              value={tableId}
              onChange={setTableId}
              options={tables.map((t) => ({ value: t.id, label: `Table ${t.table_number}` }))}
              placeholder="Default table"
              allowEmpty
              emptyLabel="Default table"
              ariaLabel="Table"
            />
          </div>
        )}

        {mode === 'order' && (
          <div className="field">
            <label>Customer</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in"
            />
          </div>
        )}

        <div className="field">
          <label>Paid by</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            {/* Aggregator and delivery takings are money through a different
                door, not a different card machine. Recorded as their own
                method, the payment report separates platform sales from
                dine-in without anyone having to reconcile it by hand. */}
            <option value="zomato">Zomato</option>
            <option value="swiggy">Swiggy</option>
            <option value="home_delivery">Home delivery</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* ----------------------------------------------------------- what */}
      <div className="card">
        <div className="card__head">
          <div>
            <div className="card__title">
              {mode === 'day' ? 'Dishes sold that day' : 'Items on this bill'}
            </div>
            <div className="card__subtitle">
              Leave the price blank to use the current menu price
            </div>
          </div>
        </div>

        <div className="se-head">
          <div className="se-dish">Dish</div>
          <div className="se-qty">Qty</div>
          <div className="se-price">Unit price</div>
          <div className="se-amt">Amount</div>
          <div className="se-x" />
        </div>

        {lines.map((l) => {
          const dish = dishById.get(l.menuItemId);
          const unit = l.price === '' ? Number(dish?.price) || 0 : Number(l.price) || 0;
          const amount = unit * (Number(l.quantity) || 0);
          return (
            <div key={l.key} className="se-row">
              <div className="se-dish">
                <SearchSelect
                  className="ss-root--cell"
                  value={l.menuItemId}
                  onChange={(v) => setLine(l.key, { menuItemId: v })}
                  options={sellable
                    .filter((d) => d.id === l.menuItemId || !chosen.includes(d.id))
                    .map((d) => ({
                      value: d.id, label: d.item_name, sub: money(d.price),
                    }))}
                  placeholder="Select dish…"
                  ariaLabel="Dish"
                />
              </div>
              <div className="se-qty">
                <input
                  className="gcell" type="number" min="0" step="1"
                  value={l.quantity}
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                  placeholder="0"
                  aria-label="Quantity"
                />
              </div>
              <div className="se-price">
                <input
                  className="gcell" type="number" min="0" step="any"
                  value={l.price}
                  onChange={(e) => setLine(l.key, { price: e.target.value })}
                  placeholder={dish ? String(dish.price) : '—'}
                  aria-label="Unit price"
                />
              </div>
              <div className="se-amt tnum">{amount > 0 ? money(amount) : '—'}</div>
              <div className="se-x">
                <button className="step step--danger" onClick={() => removeLine(l.key)} title="Remove">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}

        <button
          className="ln-add"
          style={{ marginTop: 10 }}
          onClick={() => setLines((p) => [...p, blankLine()])}
        >
          <Plus size={14} /> Add another dish
        </button>

        <div className="se-foot">
          <div className="se-totals">
            <div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
            {taxPct > 0 && (
              <div><span>Tax ({taxPct}%)</span><strong>{money(totals.tax)}</strong></div>
            )}
            <div className="se-grand"><span>Total</span><strong>{money(totals.total)}</strong></div>
          </div>
          <button
            className="btn btn--primary"
            onClick={submit}
            disabled={saving || filled === 0 || tables.length === 0}
          >
            {saving ? 'Recording…' : (
              <><CheckCircle2 size={15} /> Record sale on {fmtDate(date)}</>
            )}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- recent */}
      {recentTotal > 0 && (
        <div className="table-card table-card--padded">
          <div className="table-head">
            <div className="se-r-date">Recorded for</div>
            <div className="se-r-items">Dishes</div>
            <div className="se-r-note">Note</div>
            <div className="se-r-total">Total</div>
          </div>
          {recent.map((o) => (
            <div
              key={o.id}
              className="table-row se-r-row"
              role="button"
              tabIndex={0}
              onClick={() => setOpenEntryId(o.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenEntryId(o.id);
                }
              }}
              title="See what was in this entry"
            >
              <div className="se-r-date strong">{fmtDate(o.created_at)}</div>
              <div className="se-r-items muted">{(o.order_items || []).length}</div>
              <div className="se-r-note muted">{o.notes}</div>
              <div className="se-r-total amount">{money(o.total)}</div>
            </div>
          ))}
          <Pager
            page={recentPage}
            pageSize={HISTORY_PAGE_SIZE}
            total={recentTotal}
            onPage={setRecentPage}
          />
        </div>
      )}

      {openEntryId && (
        <SaleEntryDrawer
          key={openEntryId}
          orderId={openEntryId}
          loadEntry={loadEntry}
          onClose={() => setOpenEntryId(null)}
        />
      )}

      {!loading && recentTotal === 0 && (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state__mark"><ClipboardList size={22} /></span>
            <div className="empty-state__title">Nothing entered after the fact yet</div>
            <div className="empty-state__sub">
              Sales recorded here will be listed, so you can see which days have been
              caught up on.
            </div>
          </div>
        </div>
      )}

      <MastersStyles />
      <style>{`
        .se-explain {
          padding: 13px 15px; border-radius: var(--radius-md);
          background: var(--color-info-soft, #EAF1FE);
          color: var(--color-text-soft); font-size: 12.5px; line-height: 1.6;
        }

        .se-head, .se-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
        .se-head {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.04em; color: var(--color-text-muted);
          border-bottom: 1px solid var(--color-border); padding-bottom: 8px;
        }
        .se-dish  { flex: 2.4; min-width: 0; }
        .se-qty   { width: 90px; }
        .se-price { width: 110px; }
        .se-amt   { width: 110px; text-align: right; font-weight: 700; }
        .se-x     { width: 34px; display: flex; justify-content: flex-end; }

        .ln-add {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px dashed var(--color-border); border-radius: var(--radius-md);
          background: none; padding: 9px 13px; font: inherit; font-size: 13px;
          font-weight: 600; color: var(--color-text-muted); cursor: pointer;
        }
        .ln-add:hover { border-color: var(--color-border-strong); color: var(--color-text); }

        .se-foot {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 16px; margin-top: 18px; padding-top: 16px;
          border-top: 1px solid var(--color-border); flex-wrap: wrap;
        }
        .se-totals { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
        .se-totals div { display: flex; gap: 20px; justify-content: space-between; min-width: 210px; }
        .se-totals span { color: var(--color-text-muted); }
        .se-grand { padding-top: 5px; border-top: 1px solid var(--color-border-soft); }
        .se-grand strong { font-size: 18px; }

        .se-r-date  { width: 160px; }
        .se-r-items { width: 90px; text-align: center; }
        .se-r-note  { flex: 1; min-width: 0; font-size: 12.5px; }
        .se-r-total { width: 110px; text-align: right; }
        .se-r-row { cursor: pointer; }
        .se-r-row:hover { background: var(--color-surface-muted, #F7F7F8); }
        .se-r-row:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }

        .step {
          width: 26px; height: 26px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface);
          color: var(--color-text-muted); display: inline-flex;
          align-items: center; justify-content: center; cursor: pointer;
        }
        .step--danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }
        .tnum { font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}

const PAY_LABEL = {
  cash: 'Cash', card: 'Card', upi: 'UPI', zomato: 'Zomato', swiggy: 'Swiggy',
  home_delivery: 'Home delivery', other: 'Other',
};

/** The dishes, quantities and bill behind one row of the history. */
function SaleEntryDrawer({ orderId, loadEntry, onClose }) {
  const [entry, setEntry] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    loadEntry(orderId).then((res) => {
      if (!live) return;
      if (res.success && res.entry) setEntry(res.entry);
      else setErr(res.error || 'This entry could not be found.');
    });
    return () => { live = false; };
  }, [orderId, loadEntry]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = entry?.order_items || [];
  const qty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const bill = Array.isArray(entry?.bills) ? entry.bills[0] : entry?.bills;
  const isDaySheet = /Day sheet/i.test(entry?.notes || '');

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer drawer--wide sed">
        <div className="sed__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card__title">
              {entry ? `Sale on ${fmtDate(entry.created_at)}` : 'Sale entry'}
            </div>
            {entry?.notes && <div className="card__subtitle">{entry.notes}</div>}
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        {err && <div className="mst-note bad">{err}</div>}
        {!entry && !err && <div className="empty-state">Loading entry…</div>}

        {entry && (
          <>
            <div className="sed__meta">
              <div><span>Booked at</span><strong>{fmtDateTime(entry.created_at)}</strong></div>
              <div>
                <span>{isDaySheet ? 'Type' : 'Table'}</span>
                <strong>
                  {isDaySheet
                    ? 'Day total'
                    : `Table ${entry.restaurant_tables?.table_number ?? '—'}`}
                </strong>
              </div>
              {!isDaySheet && (
                <div>
                  <span>Customer</span>
                  <strong>{entry.customer_sessions?.customer_name || 'Walk-in'}</strong>
                </div>
              )}
              <div>
                <span>Paid by</span>
                <strong>{PAY_LABEL[bill?.payment_method] || bill?.payment_method || '—'}</strong>
              </div>
            </div>

            <div className="sed__rowhead">
              <div className="sed__dish">Dish</div>
              <div className="sed__qty">Qty</div>
              <div className="sed__price">Unit price</div>
              <div className="sed__amt">Amount</div>
            </div>
            {items.map((i) => (
              <div key={i.id} className="sed__row">
                <div className="sed__dish">{i.menu_items?.item_name || 'Deleted dish'}</div>
                <div className="sed__qty tnum">{i.quantity}</div>
                <div className="sed__price tnum">{money(i.item_price)}</div>
                <div className="sed__amt tnum">
                  {money(i.total_price ?? (Number(i.item_price) || 0) * (Number(i.quantity) || 0))}
                </div>
              </div>
            ))}

            <div className="sed__totals">
              <div>
                <span>{items.length} dish{items.length === 1 ? '' : 'es'} · {qty} qty</span>
              </div>
              <div><span>Subtotal</span><strong>{money(entry.subtotal)}</strong></div>
              {Number(entry.tax) > 0 && (
                <div><span>Tax</span><strong>{money(entry.tax)}</strong></div>
              )}
              <div className="sed__grand"><span>Total</span><strong>{money(entry.total)}</strong></div>
            </div>
          </>
        )}

        <style>{`
          .sed { width: 560px; }
          .sed__head {
            display: flex; align-items: flex-start; gap: 12px;
            padding-bottom: 14px; border-bottom: 1px solid var(--color-border);
          }
          .sed__meta {
            display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
            padding: 14px 0; border-bottom: 1px solid var(--color-border-soft);
          }
          .sed__meta div { display: flex; flex-direction: column; gap: 2px; }
          .sed__meta span { font-size: 11px; font-weight: 600; color: var(--color-text-muted); }
          .sed__meta strong { font-size: 13.5px; }
          .sed__rowhead, .sed__row { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
          .sed__rowhead {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.04em; color: var(--color-text-muted);
            border-bottom: 1px solid var(--color-border); margin-top: 6px;
          }
          .sed__row { font-size: 13px; border-bottom: 1px solid var(--color-border-soft); }
          .sed__dish  { flex: 1; min-width: 0; font-weight: 600; }
          .sed__rowhead .sed__dish { font-weight: 700; }
          .sed__qty   { width: 50px; text-align: right; }
          .sed__price { width: 90px; text-align: right; }
          .sed__amt   { width: 95px; text-align: right; font-weight: 700; }
          .sed__totals {
            display: flex; flex-direction: column; gap: 4px; align-items: flex-end;
            padding-top: 14px; font-size: 13px;
          }
          .sed__totals div { display: flex; gap: 20px; justify-content: space-between; min-width: 230px; }
          .sed__totals span { color: var(--color-text-muted); }
          .sed__grand { padding-top: 5px; border-top: 1px solid var(--color-border-soft); }
          .sed__grand strong { font-size: 18px; }
          .tnum { font-variant-numeric: tabular-nums; }
          @media (max-width: 600px) {
            .sed { width: 100vw; padding: 20px 16px; }
            .sed__price { display: none; }
          }
        `}</style>
      </div>
    </>
  );
}
