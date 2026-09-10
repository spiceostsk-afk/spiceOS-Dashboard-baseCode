import React, { useMemo, useRef, useState } from 'react';
import {
  Calendar, Clock, X, Star, RotateCcw, PlusCircle, Search, ArrowRight,
  CheckCircle2, Upload, FileDown, AlertTriangle, Package, Trash2,
} from 'lucide-react';
import { useStockCount, useStockCountHistory } from '../../hooks/useStockCount';
import { useOutlet } from '../../context/OutletContext';
import ClosingStockHistory from './ClosingStockHistory';
import { useStockDocuments, useStockCountHistoryDetail } from '../../hooks/useStockDocuments';
import { ConfirmDelete } from '../masters/masterDialogs';
import { fmtDate } from '../../lib/dates';

/**
 * Counting stock, for both the end-of-day close and a mid-service spot check.
 *
 * The two modes are one screen because they are one job. `closing` records the
 * day's official closing figure; `available` is a sanity check on what is on
 * hand right now. Only the labels and the emphasis change.
 *
 * The number the operator types is measured against `ideal` — what the system
 * believes is there — and the gap between them is the variance. That gap is
 * the whole point of the screen, so it is shown live, per row, before anything
 * is committed.
 */

const CYCLES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const fmt = (n, digits = 3) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(digits).replace(/\.?0+$/, '');
};


/* --------------------------------------------------------------- Add-up pad */
/**
 * Counting rarely produces one number. It produces "two full crates, one
 * half-crate and four loose", and the person counting should not have to do
 * that arithmetic on the back of a docket.
 */
function AddUpPad({ row, onAdd, onClose }) {
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState(row.enteredUnit || 'base');
  const hasPurchaseUnit = row.purchaseUnit !== row.unit;

  const submit = (e) => {
    e.preventDefault();
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0) return;
    onAdd(n, unit);
    setQty('');
  };

  return (
    <>
      <div className="pad-scrim" onClick={onClose} />
      <form className="pad" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div className="pad__title">Add to count</div>
        <div className="pad__sub">{row.name}</div>

        <div className="pad__row">
          <input
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Quantity"
            autoFocus
          />
          {hasPurchaseUnit ? (
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="base">{row.unit}</option>
              <option value="purchase">{row.purchaseUnit}</option>
            </select>
          ) : (
            <span className="pad__unit">{row.unit}</span>
          )}
        </div>

        {hasPurchaseUnit && unit === 'purchase' && (
          <div className="pad__hint">
            1 {row.purchaseUnit} = {fmt(row.conversion)} {row.unit}
          </div>
        )}

        <div className="pad__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Done</button>
          <button type="submit" className="btn btn--primary btn--sm">Add</button>
        </div>
      </form>
    </>
  );
}

/* ----------------------------------------------------------------- Review */
function ReviewPanel({ rows, mode, onBack, onConfirm, submitting }) {
  const entered = rows.filter((r) => r.hasEntry);
  const withVariance = entered.filter((r) => r.variancePreview !== 0);
  const netValue = entered.reduce(
    (sum, r) => sum + (r.variancePreview || 0) * (Number(r.rate) || 0), 0,
  );

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <div className="card__title">Review {mode === 'closing' ? 'closing' : 'available'} stock</div>
          <div className="card__subtitle">
            {entered.length} item{entered.length === 1 ? '' : 's'} counted ·{' '}
            {withVariance.length} with a variance
          </div>
        </div>
        <button className="btn btn--ghost" onClick={onBack}>Back to entry</button>
      </div>

      {withVariance.length > 0 && (
        <div className="review-warn">
          <AlertTriangle size={15} />
          <span>
            Confirming writes the variance to the stock ledger. After this, the system
            stock matches what was counted.
          </span>
        </div>
      )}

      <div className="table-head review-head">
        <div className="rc-name">Raw material</div>
        <div className="rc-num">Ideal</div>
        <div className="rc-num">Physical</div>
        <div className="rc-num">Variance</div>
        <div className="rc-remark">Remark</div>
      </div>

      {entered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__sub">Nothing counted yet — go back and enter some quantities.</div>
        </div>
      )}

      {entered.map((r) => (
        <div key={r.itemId} className="table-row review-row">
          <div className="rc-name strong">{r.name}</div>
          <div className="rc-num muted tnum">{fmt(r.ideal)} {r.unit}</div>
          <div className="rc-num strong tnum">{fmt(r.physicalPreview)} {r.unit}</div>
          <div className="rc-num tnum">
            {r.variancePreview === 0 ? (
              <span className="pill tone-green pill--sm">Match</span>
            ) : (
              <span className={`pill pill--sm ${r.variancePreview > 0 ? 'tone-blue' : 'tone-red'}`}>
                {r.variancePreview > 0 ? '+' : ''}{fmt(r.variancePreview)}
              </span>
            )}
          </div>
          <div className="rc-remark muted">{r.remarkDraft || '—'}</div>
        </div>
      ))}

      <div className="review-foot">
        <div className="review-foot__val">
          Net variance value
          <strong>
            {netValue < 0 ? '−' : ''}₹{Math.abs(netValue).toFixed(2)}
          </strong>
        </div>
        <button
          className="btn btn--primary"
          onClick={onConfirm}
          disabled={submitting || entered.length === 0}
        >
          {submitting ? 'Posting…' : (
            <>
              <CheckCircle2 size={15} /> Confirm &amp; post
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Excel import */
/**
 * A CSV of `item name, quantity` — the shape every spreadsheet exports and
 * every stock sheet already is. Rows are matched by name or barcode; anything
 * unmatched is reported rather than silently dropped, because a line that
 * vanishes without complaint is how a count ends up wrong.
 */
function ImportPanel({ rows, onApply }) {
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);

  const parse = (text) => {
    const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
    const byBarcode = new Map(
      rows.filter((r) => r.barcode).map((r) => [r.barcode.trim().toLowerCase(), r]),
    );

    const matched = [];
    const unmatched = [];

    text.split(/\r?\n/).forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const cells = trimmed.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (cells.length < 2) return;
      // Skip a header row.
      if (i === 0 && Number.isNaN(Number(cells[1]))) return;

      const key = cells[0].toLowerCase();
      const row = byName.get(key) || byBarcode.get(key);
      const qty = Number(cells[1]);

      if (!row || !Number.isFinite(qty)) {
        unmatched.push(cells[0]);
        return;
      }
      matched.push({ itemId: row.itemId, qty });
    });

    setResult({ matched: matched.length, unmatched });
    if (matched.length) onApply(matched);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const template = () => {
    const csv = ['Raw Material,Quantity']
      .concat(rows.slice(0, 200).map((r) => `"${r.name}",`))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock-count-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card import-card">
      <div className="card__title">Import via Excel</div>
      <div className="card__subtitle">
        Upload a CSV with two columns: raw material name (or barcode) and the counted
        quantity, in each item&apos;s own unit.
      </div>

      <div className="import-actions">
        <button className="btn btn--ghost" onClick={template}>
          <FileDown size={15} /> Download template
        </button>
        <button className="btn btn--primary" onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> Choose CSV file
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
      </div>

      {result && (
        <div className="import-result">
          <div className="pill tone-green">{result.matched} matched</div>
          {result.unmatched.length > 0 && (
            <>
              <div className="pill tone-amber">{result.unmatched.length} not recognised</div>
              <div className="import-miss">
                Not found: {result.unmatched.slice(0, 12).join(', ')}
                {result.unmatched.length > 12 ? ` +${result.unmatched.length - 12} more` : ''}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================ Workspace */
export default function StockCountWorkspace({ mode = 'closing' }) {
  const sheet = useStockCount(mode);
  const { history } = useStockCountHistory(mode);
  const { outlet, isMultiOutlet } = useOutlet();

  const [tab, setTab] = useState('add');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [onlyEntered, setOnlyEntered] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [padFor, setPadFor] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState(null);
  const [deletingPosted, setDeletingPosted] = useState(false);
  const [postedError, setPostedError] = useState('');

  // Acting on the sheet already posted for this date, without leaving the
  // screen for the History tab.
  const { counts: postedSheets, refresh: refreshHistory } = useStockCountHistoryDetail(mode);
  const docs = useStockDocuments(async () => { await refreshHistory(); await sheet.refresh(); });
  const postedSheet = postedSheets.find((c) => c.date === sheet.date) || null;

  const currentLabel = mode === 'closing' ? 'Closing Stock' : 'Current';
  const title = mode === 'closing' ? 'Closing Stock' : 'Available Stock';

  const flash = (msg, tone = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheet.rows.filter((r) => {
      if (category === 'none' && r.categoryId) return false;
      if (category !== 'all' && category !== 'none' && r.categoryId !== category) return false;
      if (onlyFavourites && !r.favourite) return false;
      if (onlyEntered && !r.hasEntry) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.barcode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sheet.rows, category, search, onlyFavourites, onlyEntered]);

  const counts = useMemo(() => {
    const byCat = new Map();
    sheet.rows.forEach((r) => {
      const key = r.categoryId || 'none';
      byCat.set(key, (byCat.get(key) || 0) + 1);
    });
    return byCat;
  }, [sheet.rows]);

  const handleQuickSave = async () => {
    const res = await sheet.saveDraft();
    flash(res.success ? 'Draft saved.' : res.error || 'Could not save.', res.success ? 'ok' : 'bad');
  };

  const handleConfirm = async () => {
    const res = await sheet.submit();
    if (res.success) {
      setReviewing(false);
      flash(`${title} posted. System stock now matches the count.`);
    } else {
      flash(res.error || 'Could not post the count.', 'bad');
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Clear every entry on this sheet?')) return;
    const res = await sheet.resetSheet();
    flash(res.success ? 'Sheet cleared.' : res.error || 'Could not clear.', res.success ? 'ok' : 'bad');
  };

  const applyImport = (matched) => {
    matched.forEach(({ itemId, qty }) => sheet.setEntry(itemId, { qty: String(qty), unit: 'base' }));
    setTab('add');
    flash(`${matched.length} quantities filled in from the file.`);
  };

  const addToRow = (row, qty, unit) => {
    // Adding across units only makes sense in one currency: normalise to base.
    const asBase = unit === 'purchase' ? qty * row.conversion : qty;
    const currentBase = row.physicalPreview ?? 0;
    const nextBase = Math.round((currentBase + asBase) * 1000) / 1000;
    sheet.setEntry(row.itemId, { qty: String(nextBase), unit: 'base' });
  };

  /**
   * Exports the day being looked at, one row per counted line.
   *
   * Deliberately this date only. The History tab exports everything; someone
   * standing on 31 August wants 31 August, not eight months of sheets.
   */
  const exportPostedDay = () => {
    if (!postedSheet) return;
    const esc = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const head = ['Date', 'Raw Material', 'Unit', 'Ideal', 'Physical', 'Variance', 'Remark'];
    const body = postedSheet.lines.map((l) => [
      postedSheet.date, l.name, l.unit, l.ideal, l.physical, l.variance, l.remark,
    ].map(esc).join(','));

    const url = URL.createObjectURL(
      new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mode}-stock-${postedSheet.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reopenPosted = async () => {
    if (!postedSheet) return;
    const res = await docs.reopenCount(postedSheet.id);
    flash(res.success
      ? `${fmtDate(sheet.date)} reopened — its stock correction has been undone, and the counted numbers are still on the sheet.`
      : res.error, res.success ? 'ok' : 'bad');
  };

  const confirmDeletePosted = async () => {
    setPostedError('');
    const res = await docs.deleteDocument('count', postedSheet.id);
    if (res.success) {
      setDeletingPosted(false);
      flash(`Count for ${fmtDate(sheet.date)} deleted.`);
    } else {
      setPostedError(res.error);
    }
  };

  if (sheet.isSubmitted) {
    return (
      <div className="page">
        <div className="stock-top">
          <h2 className="stock-title">{title}</h2>
          <div className="stock-top__actions">
            <label className="ghost-pill">
              <Calendar size={14} />
              <input
                type="date"
                className="date-input"
                value={sheet.date}
                onChange={(e) => sheet.setDate(e.target.value)}
              />
            </label>
          </div>
        </div>

        {toast && (
          <div className={`stock-toast ${toast.tone === 'bad' ? 'bad' : ''}`}>{toast.msg}</div>
        )}

        <div className="card">
          <div className="empty-state">
            <span className="empty-state__mark tone-green"><CheckCircle2 size={22} /></span>
            <div className="empty-state__title">
              {title} posted for {fmtDate(sheet.date)}
            </div>
            <div className="empty-state__sub">
              {postedSheet
                ? `${postedSheet.counted} material${postedSheet.counted === 1 ? '' : 's'} counted, `
                  + `${postedSheet.mismatched} with a variance. Its corrections are on the ledger.`
                : 'This sheet is closed and its variances are on the ledger.'}
            </div>

            <div className="posted-actions">
              <button
                className="btn btn--ghost"
                onClick={exportPostedDay}
                disabled={!postedSheet}
              >
                <FileDown size={15} /> Export this day
              </button>
              <button
                className="btn btn--primary"
                onClick={reopenPosted}
                disabled={!postedSheet || docs.busy}
              >
                <RotateCcw size={15} /> Edit this count
              </button>
              <button
                className="btn btn--danger"
                onClick={() => { setPostedError(''); setDeletingPosted(true); }}
                disabled={!postedSheet || docs.busy}
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>

            <div className="posted-hint">
              Editing undoes this count&apos;s stock correction and hands the sheet back with
              the counted numbers still on it, so you correct what was typed rather than
              starting again.
            </div>
          </div>
        </div>

        {deletingPosted && postedSheet && (
          <ConfirmDelete
            title="Delete stock count"
            subject={`${title} — ${fmtDate(sheet.date)}`}
            permanent
            busy={docs.busy}
            error={postedError}
            consequences={[
              `The ${postedSheet.counted} counted quantit${postedSheet.counted === 1 ? 'y' : 'ies'} and their remarks are removed.`,
              postedSheet.mismatched > 0
                ? `The stock correction this count applied across ${postedSheet.mismatched} material${postedSheet.mismatched === 1 ? '' : 's'} is undone, and those balances go back to what the books said before it.`
                : 'This count changed no balances, so stock is unaffected.',
              'The Stock Summary for that date will report differently afterwards.',
            ]}
            onCancel={() => setDeletingPosted(false)}
            onConfirm={confirmDeletePosted}
          />
        )}

        <WorkspaceStyles />
      </div>
    );
  }

  return (
    <div className="page">
      {/* ------------------------------------------------------------- top */}
      <div className="stock-top">
        <div>
          <h2 className="stock-title">{title}</h2>
          {isMultiOutlet && outlet && (
            <div className="card__subtitle">{outlet.name}</div>
          )}
        </div>

        <div className="stock-top__actions">
          <label className="ghost-pill">
            <Calendar size={14} />
            <input
              type="date"
              className="date-input"
              value={sheet.date}
              onChange={(e) => sheet.setDate(e.target.value)}
            />
          </label>

          <div className="hist-wrap">
            <button className="btn btn--ghost" onClick={() => setShowHistory((v) => !v)}>
              <Clock size={14} /> History
            </button>
            {showHistory && (
              <>
                <div className="pad-scrim" onClick={() => setShowHistory(false)} />
                <div className="hist">
                  <div className="hist__title">Past submissions</div>
                  {history.length === 0 && <div className="hist__empty">Nothing posted yet.</div>}
                  {history.map((h) => (
                    <button
                      key={h.id}
                      className="hist__row"
                      onClick={() => { sheet.setDate(h.count_date); setShowHistory(false); }}
                    >
                      <span>{fmtDate(h.count_date)}</span>
                      <span className="pill tone-green pill--sm">Posted</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button className="btn btn--ghost" onClick={handleReset} disabled={sheet.saving}>
            <X size={14} /> Reset
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="stock-tabs">
        <button className={tab === 'add' ? 'on' : ''} onClick={() => setTab('add')}>
          Add {mode === 'closing' ? 'Closing' : 'Available'} Stock
        </button>
        <button className={tab === 'import' ? 'on' : ''} onClick={() => setTab('import')}>
          Import Via Excel
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          History
        </button>
      </div>

      {toast && (
        <div className={`stock-toast ${toast.tone === 'bad' ? 'bad' : ''}`}>{toast.msg}</div>
      )}

      {tab === 'import' && <ImportPanel rows={sheet.rows} onApply={applyImport} />}

      {tab === 'history' && (
        <ClosingStockHistory
          type={mode}
          onEdit={(d) => { sheet.setDate(d); setTab('add'); }}
        />
      )}

      {tab === 'add' && reviewing && (
        <ReviewPanel
          rows={sheet.rows}
          mode={mode}
          submitting={sheet.saving}
          onBack={() => setReviewing(false)}
          onConfirm={handleConfirm}
        />
      )}

      {tab === 'add' && !reviewing && (
        <div className="stock-body">
          {/* --------------------------------------------------- category rail */}
          <aside className="cat-rail">
            <div className="cat-rail__head">Categories</div>
            <button
              className={`cat-row ${category === 'all' ? 'on' : ''}`}
              onClick={() => setCategory('all')}
            >
              <span>All categories</span>
              <span className="cat-row__n">{sheet.rows.length}</span>
            </button>
            <button
              className={`cat-row ${category === 'none' ? 'on' : ''}`}
              onClick={() => setCategory('none')}
            >
              <span>No category</span>
              <span className="cat-row__n">{counts.get('none') || 0}</span>
            </button>
            {sheet.categories.map((c) => (
              <button
                key={c.id}
                className={`cat-row ${category === c.id ? 'on' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                <span>{c.name}</span>
                <span className="cat-row__n">{counts.get(c.id) || 0}</span>
              </button>
            ))}
          </aside>

          {/* --------------------------------------------------------- sheet */}
          <section className="sheet">
            <div className="sheet__tools">
              <div className="search-input sheet__search">
                <Search size={15} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search raw material or barcode"
                />
              </div>

              <label className="cycle">
                <span>Stock update cycle:</span>
                <select value={sheet.cycle} onChange={(e) => sheet.setCycle(e.target.value)}>
                  {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>

              <button
                className={`chip ${onlyFavourites ? 'on' : ''}`}
                onClick={() => setOnlyFavourites((v) => !v)}
              >
                <Star size={13} /> Favourites
              </button>
              <button
                className={`chip ${onlyEntered ? 'on' : ''}`}
                onClick={() => setOnlyEntered((v) => !v)}
              >
                <CheckCircle2 size={13} /> Entered today
              </button>
            </div>

            <div className="table-head sheet__head">
              <div className="sc-name">Raw Material</div>
              <div className="sc-cur">{currentLabel}</div>
              <div className="sc-new">New Stock</div>
              <div className="sc-var">Variance</div>
              <div className="sc-act" />
            </div>

            {sheet.loading && <div className="empty-state">Loading stock sheet…</div>}

            {!sheet.loading && visible.length === 0 && (
              <div className="empty-state">
                <span className="empty-state__mark"><Package size={22} /></span>
                <div className="empty-state__title">Nothing to count here</div>
                <div className="empty-state__sub">
                  {sheet.rows.length === 0
                    ? 'Add raw materials in Inventory before running a count.'
                    : 'No item matches these filters.'}
                </div>
              </div>
            )}

            {!sheet.loading && visible.map((r) => (
              <div key={r.itemId} className={`table-row sheet__row ${r.hasEntry ? 'done' : ''}`}>
                <div className="sc-name">
                  <div className="strong">{r.name}</div>
                  {r.barcode && <div className="sc-barcode">{r.barcode}</div>}
                </div>

                <div className={`sc-cur tnum ${r.ideal < 0 ? 'neg' : ''}`}>
                  {fmt(r.ideal)} {r.unit}
                </div>

                <div className="sc-new">
                  <div className="qty-input">
                    <input
                      type="number"
                      step="any"
                      value={r.entered ?? ''}
                      onChange={(e) => sheet.setEntry(r.itemId, { qty: e.target.value })}
                      placeholder=""
                      aria-label={`New stock for ${r.name}`}
                    />
                    {r.purchaseUnit !== r.unit ? (
                      <select
                        value={r.enteredUnit}
                        onChange={(e) => sheet.setEntry(r.itemId, { unit: e.target.value })}
                        aria-label={`Unit for ${r.name}`}
                      >
                        <option value="base">/ {r.unit}</option>
                        <option value="purchase">/ {r.purchaseUnit}</option>
                      </select>
                    ) : (
                      <span className="qty-input__unit">/ {r.unit}</span>
                    )}
                  </div>
                </div>

                <div className="sc-var">
                  {r.hasEntry ? (
                    <>
                      <span
                        className={`pill pill--sm ${
                          r.variancePreview === 0 ? 'tone-green'
                            : r.variancePreview > 0 ? 'tone-blue' : 'tone-red'
                        }`}
                      >
                        {r.variancePreview === 0 ? 'Match'
                          : `${r.variancePreview > 0 ? '+' : ''}${fmt(r.variancePreview)} ${r.unit}`}
                      </span>
                      {r.variancePreview !== 0 && (
                        <input
                          className="remark-input"
                          value={r.remarkDraft || ''}
                          onChange={(e) => sheet.setEntry(r.itemId, { remark: e.target.value })}
                          placeholder="Remark"
                          aria-label={`Remark for ${r.name}`}
                        />
                      )}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>

                <div className="sc-act">
                  <button
                    className="step"
                    title="Add up several counts"
                    onClick={() => setPadFor(r.itemId)}
                  >
                    <PlusCircle size={14} />
                  </button>
                  <button
                    className="step"
                    title="Clear this row"
                    onClick={() => sheet.clearEntry(r.itemId)}
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    className={`step step--star ${r.favourite ? 'on' : ''}`}
                    title={r.favourite ? 'Remove from favourites' : 'Mark as favourite'}
                    onClick={() => sheet.toggleFavourite(r.itemId, !r.favourite)}
                  >
                    <Star size={13} fill={r.favourite ? 'currentColor' : 'none'} />
                  </button>
                </div>

                {padFor === r.itemId && (
                  <AddUpPad
                    row={r}
                    onAdd={(qty, unit) => addToRow(r, qty, unit)}
                    onClose={() => setPadFor(null)}
                  />
                )}
              </div>
            ))}
          </section>
        </div>
      )}

      {/* ----------------------------------------------------------- footer */}
      {tab === 'add' && !reviewing && (
        <div className="sheet__foot">
          <div className="sheet__count">
            {sheet.enteredCount} of {sheet.rows.length} counted
          </div>
          <button className="link-btn" onClick={sheet.clearAll}>Clear all entries</button>
          <button className="btn btn--ghost" onClick={handleQuickSave} disabled={sheet.saving}>
            {sheet.saving ? 'Saving…' : 'Quick Save'}
          </button>
          <button
            className="btn btn--primary"
            onClick={() => setReviewing(true)}
            disabled={sheet.enteredCount === 0}
          >
            Review <ArrowRight size={15} />
          </button>
        </div>
      )}

      <WorkspaceStyles />
    </div>
  );
}

function WorkspaceStyles() {
  return (
    <style>{`
      .posted-actions {
        display: flex; gap: 10px; flex-wrap: wrap;
        justify-content: center; margin-top: 16px;
      }
      .posted-hint {
        max-width: 460px; margin-top: 12px;
        font-size: 12.5px; line-height: 1.6; color: var(--color-text-muted);
      }

      .stock-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .stock-title { font-size: 20px; font-weight: 800; margin: 0; }
      .stock-top__actions { display: flex; align-items: center; gap: 8px; }

      .ghost-pill {
        display: inline-flex; align-items: center; gap: 7px;
        height: 40px; padding: 0 12px;
        border: 1px solid var(--color-border); border-radius: var(--radius-md);
        background: var(--color-surface); color: var(--color-text);
        font-size: 13px; font-weight: 600;
      }
      .date-input {
        border: none; background: none; font: inherit; color: inherit;
        padding: 0; outline: none;
      }

      .hist-wrap { position: relative; }
      .hist {
        position: absolute; top: 46px; right: 0; z-index: 62;
        width: 260px; max-height: 320px; overflow-y: auto;
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-md); box-shadow: var(--shadow-modal); padding: 8px;
      }
      .hist__title {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.04em; color: var(--color-text-muted); padding: 6px 8px;
      }
      .hist__empty { padding: 10px 8px; font-size: 13px; color: var(--color-text-muted); }
      .hist__row {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        width: 100%; padding: 9px 8px; border: none; background: none;
        border-radius: 8px; font-size: 13px; font-weight: 600; text-align: left;
        color: var(--color-text); cursor: pointer;
      }
      .hist__row:hover { background: var(--color-canvas); }

      .stock-tabs { display: flex; gap: 24px; border-bottom: 1px solid var(--color-border); }
      .stock-tabs button {
        border: none; background: none; padding: 0 0 12px; font-size: 14px;
        font-weight: 700; color: var(--color-text-muted); cursor: pointer;
        border-bottom: 2px solid transparent; margin-bottom: -1px;
      }
      .stock-tabs button.on { color: var(--color-primary); border-bottom-color: var(--color-primary); }

      .stock-toast {
        padding: 11px 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 600;
        background: var(--color-success-soft); color: var(--color-success);
      }
      .stock-toast.bad { background: var(--color-danger-soft); color: var(--color-danger); }

      .stock-body { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; }

      .cat-rail {
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-lg); padding: 10px; position: sticky; top: 0;
      }
      .cat-rail__head {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--color-text-muted); padding: 6px 10px 10px;
      }
      .cat-row {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        width: 100%; padding: 10px; border: none; background: none; border-radius: 9px;
        font-size: 13px; font-weight: 600; color: var(--color-text-soft);
        text-align: left; cursor: pointer;
      }
      .cat-row:hover { background: var(--color-canvas); }
      .cat-row.on { background: var(--color-primary-soft, #FDECEC); color: var(--color-primary); }
      .cat-row__n { font-size: 11.5px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
      .cat-row.on .cat-row__n { color: var(--color-primary); }

      .sheet {
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-lg); padding: 14px 20px 8px;
      }
      .sheet__tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-bottom: 14px; }
      .sheet__search { flex: 1; min-width: 220px; }
      .cycle { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }
      .cycle select {
        height: 36px; padding: 0 8px; border: 1px solid var(--color-border);
        border-radius: var(--radius-md); background: var(--color-surface);
        font: inherit; font-weight: 600; color: var(--color-text);
      }

      .sheet__head, .sheet__row { margin: 0 -20px; padding-left: 20px; padding-right: 20px; }
      .sheet__row { position: relative; align-items: flex-start; }
      .sheet__row.done { background: #FAFDFB; }

      .sc-name { flex: 1.5; min-width: 0; }
      .sc-barcode { font-size: 11.5px; color: var(--color-text-faint); font-variant-numeric: tabular-nums; }
      .sc-cur { width: 130px; font-size: 13px; font-weight: 600; color: var(--color-text-soft); }
      .sc-cur.neg { color: var(--color-danger); }
      .sc-new { width: 210px; }
      .sc-var { flex: 1; min-width: 150px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .sc-act { width: 108px; display: flex; justify-content: flex-end; gap: 6px; }

      .qty-input {
        display: flex; align-items: center;
        border: 1px solid var(--color-border); border-radius: var(--radius-md);
        background: var(--color-surface); overflow: hidden; height: 38px;
      }
      .qty-input:focus-within { border-color: var(--color-border-strong); }
      .qty-input input {
        flex: 1; min-width: 0; border: none; outline: none; background: none;
        padding: 0 10px; font: inherit; font-weight: 600;
        font-variant-numeric: tabular-nums; color: var(--color-text);
      }
      .qty-input select, .qty-input__unit {
        border: none; border-left: 1px solid var(--color-border);
        background: var(--color-canvas); height: 100%; padding: 0 8px;
        font-size: 12.5px; font-weight: 600; color: var(--color-text-muted);
        display: flex; align-items: center;
      }

      .remark-input {
        flex: 1; min-width: 90px; height: 30px; padding: 0 9px;
        border: 1px dashed var(--color-border); border-radius: 8px;
        background: none; font: inherit; font-size: 12.5px; color: var(--color-text);
        outline: none;
      }
      .remark-input:focus { border-style: solid; border-color: var(--color-border-strong); }

      .step {
        width: 28px; height: 28px; border: 1px solid var(--color-border);
        border-radius: 8px; background: var(--color-surface);
        color: var(--color-text-muted); display: inline-flex;
        align-items: center; justify-content: center; cursor: pointer;
      }
      .step:hover { background: var(--color-canvas); color: var(--color-text); }
      .step--star.on { color: var(--color-warning); border-color: var(--color-warning); }

      .pad-scrim { position: fixed; inset: 0; z-index: 60; }
      .pad {
        position: absolute; right: 92px; top: 44px; z-index: 61; width: 250px;
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-md); box-shadow: var(--shadow-modal); padding: 14px;
        display: flex; flex-direction: column; gap: 9px;
      }
      .pad__title { font-size: 13px; font-weight: 700; }
      .pad__sub { font-size: 12px; color: var(--color-text-muted); }
      .pad__row { display: flex; gap: 6px; }
      .pad__row input {
        flex: 1; min-width: 0; height: 36px; padding: 0 10px;
        border: 1px solid var(--color-border); border-radius: var(--radius-md);
        font: inherit; outline: none;
      }
      .pad__row select {
        height: 36px; border: 1px solid var(--color-border);
        border-radius: var(--radius-md); font: inherit; padding: 0 6px;
      }
      .pad__unit { display: flex; align-items: center; font-size: 12.5px; color: var(--color-text-muted); }
      .pad__hint { font-size: 11.5px; color: var(--color-text-muted); }
      .pad__actions { display: flex; gap: 6px; justify-content: flex-end; }

      .sheet__foot {
        position: sticky; bottom: 0; display: flex; align-items: center; gap: 12px;
        padding: 14px 20px; background: var(--color-surface);
        border: 1px solid var(--color-border); border-radius: var(--radius-lg);
        box-shadow: 0 -2px 10px rgba(22, 24, 29, 0.04);
      }
      .sheet__count { flex: 1; font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
      .link-btn {
        border: none; background: none; font: inherit; font-size: 13px; font-weight: 600;
        color: var(--color-text-muted); text-decoration: underline; cursor: pointer;
      }
      .link-btn:hover { color: var(--color-text); }

      .review-warn {
        display: flex; align-items: center; gap: 9px; margin: 4px 0 14px;
        padding: 11px 13px; border-radius: var(--radius-md);
        background: var(--color-warning-soft); color: var(--color-warning);
        font-size: 12.5px; font-weight: 600;
      }
      .rc-name { flex: 1.5; min-width: 0; }
      .rc-num { width: 120px; }
      .rc-remark { flex: 1; min-width: 0; font-size: 12.5px; }
      .review-foot {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding-top: 16px;
      }
      .review-foot__val {
        display: flex; flex-direction: column; font-size: 12px;
        color: var(--color-text-muted); font-weight: 600;
      }
      .review-foot__val strong { font-size: 17px; color: var(--color-text); }

      .import-card { display: flex; flex-direction: column; gap: 14px; }
      .import-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .import-result { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .import-miss { font-size: 12.5px; color: var(--color-text-muted); width: 100%; }

      .tnum { font-variant-numeric: tabular-nums; }

      @media (max-width: 960px) {
        .stock-body { grid-template-columns: 1fr; }
        .cat-rail { position: static; display: flex; gap: 6px; overflow-x: auto; }
        .cat-rail__head { display: none; }
        .cat-row { width: auto; white-space: nowrap; }
      }
    `}</style>
  );
}
