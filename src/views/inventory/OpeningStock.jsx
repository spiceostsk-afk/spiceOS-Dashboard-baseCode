import React, { useMemo, useState } from 'react';
import { Calendar, Search, Package, Lock, Check, ArrowRight } from 'lucide-react';
import { useOpeningStock } from '../../hooks/useMastersData';
import { useOutlet } from '../../context/OutletContext';
import { CategoryStrip, MastersStyles } from '../masters/mastersUi';

/**
 * Opening Stock — what was on the shelf when the day started.
 *
 * This figure is DERIVED, not stored: it is the sum of everything that
 * happened before the date, which is by construction the previous day's
 * closing. The 30th's close and the 31st's open are therefore the same number
 * and cannot drift apart — there is nothing to reconcile because there is only
 * one number.
 *
 * A quantity can only be typed where nothing came before it: a brand new
 * material, or the day you started using the system. Everything else is locked,
 * because overwriting a derived opening would break the chain from one day to
 * the next and make the books stop tying together.
 */

const fmt = (n) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, '');
};

const dateLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
});

const previousDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

export default function OpeningStock() {
  const { rows, date, setDate, loading, error, setOpening } = useOpeningStock();
  const { outlet, isMultiOutlet } = useOutlet();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [notice, setNotice] = useState(null);

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 4200);
  };

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const tabs = useMemo(() => {
    const counts = new Map();
    searched.forEach((r) => counts.set(r.category, (counts.get(r.category) || 0) + 1));
    return [
      { key: 'all', label: 'All categories', count: searched.length },
      ...[...counts.keys()].sort().map((c) => ({ key: c, label: c, count: counts.get(c) })),
    ];
  }, [searched]);

  const visible = useMemo(
    () => (tab === 'all' ? searched : searched.filter((r) => r.category === tab)),
    [searched, tab],
  );

  const openable = rows.filter((r) => !r.hasHistory).length;

  const save = async (row) => {
    const qty = drafts[row.itemId];
    if (qty === '' || qty === undefined) return;
    setSaving(row.itemId);
    const res = await setOpening(row.itemId, qty);
    setSaving(null);
    if (res.success) {
      setDrafts((p) => { const n = { ...p }; delete n[row.itemId]; return n; });
      flash(`Opening stock set for ${row.name}.`);
    } else {
      flash(res.error, 'bad');
    }
  };

  return (
    <div className="page">
      <div className="mst-top">
        <div>
          <h2 className="mst-title">Opening Stock</h2>
          <div className="card__subtitle">
            {dateLabel(date)}
            {isMultiOutlet && outlet ? ` · ${outlet.name}` : ''}
          </div>
        </div>
        <label className="ghost-pill">
          <Calendar size={14} />
          <input
            type="date"
            className="date-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      {notice && <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>}
      {error && <div className="mst-note bad">{error}</div>}

      <div className="os-explain">
        <div className="os-chain">
          <span>Closing on {dateLabel(previousDay(date))}</span>
          <ArrowRight size={15} />
          <strong>Opening on {dateLabel(date)}</strong>
        </div>
        <p>
          These are the same number. Opening stock is everything that happened before
          this date, so it always equals the previous day&apos;s closing — nothing is
          stored separately and the two can never disagree.
          {openable > 0 && (
            <>
              {' '}
              {openable} material{openable === 1 ? ' has' : 's have'} no history before this
              date and can still be given a starting quantity.
            </>
          )}
        </p>
      </div>

      <div className="search-input">
        <Search size={15} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search raw material"
        />
      </div>

      <CategoryStrip tabs={tabs} active={tab} onSelect={setTab} unit="materials" />

      <div className="table-card table-card--padded">
        <div className="table-head os-head">
          <div className="os-name">Raw Material</div>
          <div className="os-cat">Category</div>
          <div className="os-qty">Opening Stock</div>
          <div className="os-src">Where it came from</div>
          <div className="os-set">Set opening</div>
        </div>

        {loading && <div className="empty-state">Loading opening stock…</div>}

        {!loading && rows.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Package size={22} /></span>
            <div className="empty-state__title">No raw materials yet</div>
            <div className="empty-state__sub">
              Add materials under Masters ▸ Raw Materials and their opening balances
              appear here.
            </div>
          </div>
        )}

        {!loading && rows.length > 0 && visible.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__sub">Nothing matches this filter.</div>
          </div>
        )}

        {!loading && visible.map((r) => (
          <div key={r.itemId} className="table-row os-row">
            <div className="os-name strong">{r.name}</div>
            <div className="os-cat muted">{r.category}</div>
            <div className="os-qty tnum">
              <span className={r.opening < 0 ? 'neg' : 'strong'}>{fmt(r.opening)}</span>{' '}
              <span className="muted">{r.unit}</span>
            </div>
            <div className="os-src">
              {r.hasHistory ? (
                <span className="os-derived">
                  <Lock size={12} /> Carried from {r.lastMovement
                    ? dateLabel(r.lastMovement) : 'earlier activity'}
                </span>
              ) : (
                <span className="muted">No earlier activity</span>
              )}
            </div>
            <div className="os-set">
              {r.hasHistory ? (
                <span className="muted os-locked">Derived</span>
              ) : (
                <div className="os-entry">
                  <input
                    type="number"
                    step="any"
                    className="gcell"
                    value={drafts[r.itemId] ?? ''}
                    onChange={(e) => setDrafts({ ...drafts, [r.itemId]: e.target.value })}
                    placeholder="0"
                    aria-label={`Opening quantity for ${r.name}`}
                  />
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => save(r)}
                    disabled={saving === r.itemId
                      || drafts[r.itemId] === undefined || drafts[r.itemId] === ''}
                  >
                    {saving === r.itemId ? '…' : <Check size={14} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <MastersStyles />
      <style>{`
        .ghost-pill {
          display: inline-flex; align-items: center; gap: 7px;
          height: 40px; padding: 0 12px;
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          background: var(--color-surface); font-size: 13px; font-weight: 600;
        }
        .date-input { border: none; background: none; font: inherit; outline: none; padding: 0; }

        .os-explain {
          padding: 14px 16px; border-radius: var(--radius-lg);
          background: var(--color-info-soft, #EAF1FE);
          border: 1px solid var(--color-info, #2563EB);
        }
        .os-chain {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          font-size: 13.5px; color: var(--color-info, #2563EB); font-weight: 600;
        }
        .os-explain p {
          margin: 7px 0 0; font-size: 12.5px; line-height: 1.6;
          color: var(--color-text-soft);
        }

        .os-head, .os-row { margin: 0 -24px; padding: 0 24px; }
        .os-name { flex: 1.5; min-width: 0; }
        .os-cat  { flex: 1; min-width: 0; }
        .os-qty  { width: 150px; text-align: right; }
        .os-src  { flex: 1.2; min-width: 0; font-size: 12.5px; }
        .os-set  { width: 190px; }

        .os-derived {
          display: inline-flex; align-items: center; gap: 6px;
          color: var(--color-text-muted); font-weight: 600;
        }
        .os-locked { font-size: 12.5px; font-weight: 600; }
        .os-entry { display: flex; gap: 6px; }
        .os-entry .gcell { width: 110px; }
        .neg { color: var(--color-danger); font-weight: 700; }
        .tnum { font-variant-numeric: tabular-nums; }

        @media (max-width: 1100px) { .os-src { display: none; } }
      `}</style>
    </div>
  );
}
