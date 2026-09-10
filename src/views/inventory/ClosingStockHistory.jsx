import React, { useState } from 'react';
import { Eye, Pencil, Trash2, ClipboardList, Download } from 'lucide-react';
import { useStockCountHistoryDetail, useStockDocuments } from '../../hooks/useStockDocuments';
import { ConfirmDelete, DetailDrawer } from '../masters/masterDialogs';
import { MastersStyles } from '../masters/mastersUi';
import { fmtDate, fmtDateTime } from '../../lib/dates';

/**
 * Everything already posted on the Closing Stock screen, with a way back in.
 *
 * Editing a posted count is not a plain update: submitting one wrote a
 * 'physical_count' movement for every variance, so those have to be taken back
 * before the sheet can be counted again — otherwise the correction lands
 * twice. reopen_stock_count does that in the database and leaves the counted
 * numbers on the sheet, so an edit corrects what was typed rather than
 * starting from a blank page.
 */

const fmt = (n) => {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, '');
};


const money = (n) => `${n < 0 ? '−' : ''}₹${Math.abs(Number(n) || 0).toFixed(2)}`;

export default function ClosingStockHistory({ type = 'closing', onEdit }) {
  const { counts, loading, error, refresh } = useStockCountHistoryDetail(type);
  const docs = useStockDocuments(refresh);

  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delError, setDelError] = useState('');
  const [notice, setNotice] = useState(null);

  /**
   * One row per counted line across every posted sheet, so the file can be
   * pivoted in Excel. A file of sheet totals would hide exactly the detail
   * someone opens a spreadsheet to look at.
   */
  const exportCsv = () => {
    const esc = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const head = ['Date', 'Status', 'Cycle', 'Raw Material', 'Unit',
                  'Ideal', 'Physical', 'Variance', 'Remark'];
    const body = [];
    counts.forEach((c) => {
      if (c.lines.length === 0) {
        body.push([c.date, c.status, c.cycle, '(nothing counted)', '', '', '', '', '']
          .map(esc).join(','));
        return;
      }
      c.lines.forEach((l) => {
        body.push([c.date, c.status, c.cycle, l.name, l.unit,
                   l.ideal, l.physical, l.variance, l.remark].map(esc).join(','));
      });
    });

    const url = URL.createObjectURL(
      new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-stock-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 4200);
  };

  /**
   * Open a sheet for more work.
   *
   * A posted count has to be REOPENED — its correction is on the ledger and
   * has to come off before the figures can be touched again. A draft has
   * posted nothing, so there is nothing to undo and it simply opens.
   *
   * The two were conflated, and because reopening only makes sense for a
   * posted count the button was disabled for everything else — which left a
   * half-finished sheet with no way back to it from here.
   */
  const handleEdit = async (count) => {
    if (count.status === 'submitted') {
      const res = await docs.reopenCount(count.id);
      if (!res.success) { flash(res.error, 'bad'); return; }
      flash(`${fmtDate(count.date)} reopened — its stock correction has been undone.`);
    }
    if (onEdit) onEdit(count.date);
  };

  const confirmDelete = async () => {
    setDelError('');
    const res = await docs.deleteDocument('count', deleting.id);
    if (res.success) {
      flash(`Count for ${fmtDate(deleting.date)} deleted.`);
      setDeleting(null);
    } else {
      setDelError(res.error);
    }
  };

  return (
    <div className="csh">
      {notice && <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>}
      {error && <div className="mst-note bad">{error}</div>}

      <div className="csh-bar">
        <span className="card__subtitle">
          {counts.length} sheet{counts.length === 1 ? '' : 's'} on record
        </span>
        <button className="btn btn--ghost" onClick={exportCsv} disabled={counts.length === 0}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div className="table-card table-card--padded">
        <div className="table-head csh-head">
          <div className="csh-date">Date</div>
          <div className="csh-cycle">Cycle</div>
          <div className="csh-n">Counted</div>
          <div className="csh-n">Variances</div>
          <div className="csh-val">Variance value</div>
          <div className="csh-status">Status</div>
          <div className="csh-act">Action</div>
        </div>

        {loading && <div className="empty-state">Loading history…</div>}

        {!loading && counts.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><ClipboardList size={22} /></span>
            <div className="empty-state__title">No sheets yet</div>
            <div className="empty-state__sub">
              Every sheet appears here, posted or not. A draft has corrected nothing
              until it is posted — open it from here to finish it off.
            </div>
          </div>
        )}

        {!loading && counts.map((c) => (
          <div key={c.id} className="table-row csh-row">
            <div className="csh-date strong">{fmtDate(c.date)}</div>
            <div className="csh-cycle muted">{c.cycle}</div>
            <div className="csh-n muted">{c.counted}</div>
            {/* A draft's variance was worked out when the sheet was typed and
                the ledger has moved since, so showing it as a finding invites
                someone to act on a stale number. It is settled on submit,
                which recomputes against the balance at that day's end. */}
            <div className="csh-n">
              {c.status !== 'submitted'
                ? <span className="csh-pending">Not posted yet</span>
                : c.mismatched === 0
                  ? <span className="pill pill--sm tone-green">All matched</span>
                  : <span className="pill pill--sm tone-amber">{c.mismatched}</span>}
            </div>
            <div className={`csh-val tnum ${c.status === 'submitted' && c.varianceValue < 0 ? 'neg' : ''}`}>
              {c.status === 'submitted' ? money(c.varianceValue) : <span className="muted">—</span>}
            </div>
            <div className="csh-status">
              <span className={`pill pill--sm ${c.status === 'submitted' ? 'tone-green' : 'tone-amber'}`}>
                {c.status === 'submitted' ? 'Posted' : c.status}
              </span>
              {c.status !== 'submitted' && c.counted > 0 && (
                <div className="csh-warn">{c.counted} counted, none applied</div>
              )}
            </div>
            <div className="csh-act">
              <button className="step" title="View detail" onClick={() => setViewing(c)}>
                <Eye size={13} />
              </button>
              <button
                className="step"
                title={c.status === 'submitted'
                  ? "Edit — undoes this count's stock correction"
                  : 'Carry on filling in this sheet'}
                onClick={() => handleEdit(c)}
                disabled={docs.busy}
              >
                <Pencil size={12} />
              </button>
              <button
                className="step step--danger"
                title="Delete"
                onClick={() => { setDelError(''); setDeleting(c); }}
                disabled={docs.busy}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <DetailDrawer
          title={`Closing stock — ${fmtDate(viewing.date)}`}
          subtitle={viewing.status === 'submitted'
            ? `Posted ${fmtDateTime(viewing.submittedAt, '')}`
            : 'Draft, not yet posted'}
          meta={[
            { label: 'Items counted', value: viewing.counted },
            { label: 'With a variance', value: viewing.mismatched },
            { label: 'Cycle', value: viewing.cycle },
            { label: 'Variance value', value: money(viewing.varianceValue) },
          ]}
          lines={viewing.lines}
          columns={[
            { key: 'name', label: 'Raw material', flex: 2 },
            { key: 'ideal', label: 'Ideal', align: 'right',
              render: (l) => `${fmt(l.ideal)} ${l.unit}` },
            { key: 'physical', label: 'Physical', align: 'right',
              render: (l) => `${fmt(l.physical)} ${l.unit}` },
            { key: 'variance', label: 'Variance', align: 'right',
              render: (l) => (l.variance === 0
                ? <span className="pill pill--sm tone-green">Match</span>
                : (
                  <span className={`pill pill--sm ${l.variance > 0 ? 'tone-blue' : 'tone-red'}`}>
                    {l.variance > 0 ? '+' : ''}{fmt(l.variance)}
                  </span>
                )) },
            { key: 'remark', label: 'Remark', flex: 1.4,
              render: (l) => l.remark || '—' },
          ]}
          footer={<><span>Net variance value</span><strong>{money(viewing.varianceValue)}</strong></>}
          onClose={() => setViewing(null)}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title="Delete stock count"
          subject={`Closing stock — ${fmtDate(deleting.date)}`}
          permanent
          busy={docs.busy}
          error={delError}
          consequences={[
            `The ${deleting.counted} counted quantit${deleting.counted === 1 ? 'y' : 'ies'} and their remarks are removed.`,
            deleting.mismatched > 0
              ? `The stock correction this count applied (${money(deleting.varianceValue)} across ${deleting.mismatched} material${deleting.mismatched === 1 ? '' : 's'}) is undone, and those balances go back to what the books said before it.`
              : 'This count changed no balances, so stock is unaffected.',
            'The Stock Summary for that date will report differently afterwards.',
          ]}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      <MastersStyles />
      <style>{`
        .csh { display: flex; flex-direction: column; gap: 14px; }
        .csh-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .csh-head, .csh-row { margin: 0 -24px; padding: 0 24px; }
        .csh-date   { width: 140px; }
        .csh-cycle  { width: 90px; text-transform: capitalize; }
        .csh-n      { width: 110px; }
        .csh-val    { width: 130px; text-align: right; font-weight: 600; }
        .csh-status { width: 130px; }
        .csh-pending { font-size: 11.5px; font-weight: 600; color: var(--color-text-faint); }
        .csh-warn {
          margin-top: 2px; font-size: 11px; font-weight: 600;
          color: var(--color-warning);
        }
        .csh-act    { flex: 1; display: flex; justify-content: flex-end; gap: 6px; }
        .neg { color: var(--color-danger); }
        .tnum { font-variant-numeric: tabular-nums; }

        .step {
          width: 26px; height: 26px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface);
          color: var(--color-text-muted); display: inline-flex;
          align-items: center; justify-content: center; cursor: pointer;
        }
        .step:hover:not(:disabled) { background: var(--color-canvas); color: var(--color-text); }
        .step:disabled { opacity: 0.35; cursor: not-allowed; }
        .step--danger:hover:not(:disabled) {
          color: var(--color-danger); border-color: var(--color-danger-border);
        }
      `}</style>
    </div>
  );
}
