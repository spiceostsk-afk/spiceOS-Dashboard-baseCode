import React, { useState } from 'react';
import { PieChart } from 'lucide-react';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});

const TONES = {
  Zomato: '#E23744',
  Swiggy: '#FC8019',
  Cash: '#12805C',
  UPI: '#2563EB',
  Card: '#6366F1',
  'Home delivery': '#7C7F87',
  Other: '#9CA0A8',
};

const ITEM_ROWS = 12;

/**
 * The selected period's takings, split the two ways a manager asks about them:
 * where the money came from, and what was actually sold.
 *
 * The two halves are counted from different places — the mode split comes off
 * settled bills, the item split off order lines — so they will not always
 * agree to the rupee. Each states its own total rather than presenting one
 * number that quietly averages the two.
 */
export default function SaleBreakdown({ channelSplit, itemSplit, loading, periodLabel }) {
  const [showAll, setShowAll] = useState(false);

  const channels = channelSplit?.rows || [];
  const items = itemSplit?.rows || [];
  const visibleItems = showAll ? items : items.slice(0, ITEM_ROWS);

  return (
    <div className="card sb">
      <div className="sb__head">
        <div>
          <div className="card__title">Sale breakdown</div>
          <div className="card__subtitle">Every rupee taken {periodLabel}, by mode and by dish</div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state__sub">Loading the split…</div>
        </div>
      ) : channels.length === 0 && items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__mark"><PieChart size={22} /></span>
          <div className="empty-state__title">Nothing sold {periodLabel}</div>
          <div className="empty-state__sub">Pick another date, or settle a bill to see it here.</div>
        </div>
      ) : (
        <div className="sb__grid">
          <section className="sb__col">
            <div className="sb__label">By payment mode</div>

            {channels.length === 0 ? (
              <div className="sb__none">No bills were settled {periodLabel}.</div>
            ) : (
              <>
                {/* One bar, so the shares can be compared without reading six
                    numbers first. */}
                <div className="sb__bar">
                  {channels.map((c) => (
                    <span
                      key={c.label}
                      style={{ width: `${c.share}%`, background: TONES[c.label] || TONES.Other }}
                      title={`${c.label} · ${c.share}%`}
                    />
                  ))}
                </div>

                <div className="sb__rows">
                  {channels.map((c) => (
                    <div key={c.label} className="sb__row">
                      <span className="sb__dot" style={{ background: TONES[c.label] || TONES.Other }} />
                      <span className="sb__name">{c.label}</span>
                      <span className="sb__sub tnum">{c.bills} bill{c.bills === 1 ? '' : 's'}</span>
                      <span className="sb__share tnum">{c.share}%</span>
                      <span className="sb__amt tnum">{INR.format(c.amount)}</span>
                    </div>
                  ))}
                  <div className="sb__row sb__row--total">
                    <span className="sb__dot sb__dot--blank" />
                    <span className="sb__name">Settled total</span>
                    <span className="sb__sub" />
                    <span className="sb__share" />
                    <span className="sb__amt tnum">{INR.format(channelSplit.paidTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="sb__col">
            <div className="sb__label">
              Item-wise sale
              <em>{items.length} dish{items.length === 1 ? '' : 'es'}</em>
            </div>

            {items.length === 0 ? (
              <div className="sb__none">No dishes were sold {periodLabel}.</div>
            ) : (
              <>
                <div className="sb__rows sb__rows--items">
                  {visibleItems.map((i) => (
                    <div key={i.key} className="sb__row sb__row--item">
                      <span className="sb__name" title={i.name}>{i.name}</span>
                      <span className="sb__cat" title={i.category}>{i.category}</span>
                      <span className="sb__sub tnum">×{i.qty}</span>
                      <span className="sb__amt tnum">{INR.format(i.amount)}</span>
                    </div>
                  ))}
                </div>

                {items.length > ITEM_ROWS && (
                  <button className="sb__more" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Show top 12 only' : `Show all ${items.length} dishes`}
                  </button>
                )}

                <div className="sb__row sb__row--total sb__row--item">
                  <span className="sb__name">Item total</span>
                  <span className="sb__cat" />
                  <span className="sb__sub" />
                  <span className="sb__amt tnum">{INR.format(itemSplit.total)}</span>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <style>{`
        .sb__head { display: flex; align-items: flex-start; margin-bottom: 16px; }

        .sb__grid {
          display: grid;
          grid-template-columns: 1fr 1.15fr;
          gap: 28px;
        }

        .sb__label {
          display: flex; align-items: baseline; gap: 8px;
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--color-text-muted);
          margin-bottom: 12px;
        }
        .sb__label em {
          font-style: normal; text-transform: none; letter-spacing: 0;
          font-weight: 600; color: var(--color-text-faint);
        }

        .sb__bar {
          display: flex; height: 10px; border-radius: 999px;
          overflow: hidden; margin-bottom: 14px;
          background: var(--color-well);
        }
        .sb__bar span { display: block; min-width: 2px; }

        .sb__rows { display: flex; flex-direction: column; }
        .sb__rows--items { max-height: 340px; overflow-y: auto; }

        .sb__row {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 0; font-size: 13px;
          border-bottom: 1px solid var(--color-border-soft);
        }
        .sb__row--total {
          border-bottom: none; border-top: 2px solid var(--color-border);
          font-weight: 700; margin-top: 2px;
        }

        .sb__dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
        .sb__dot--blank { background: transparent; }

        .sb__name {
          flex: 1; min-width: 0; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sb__cat {
          width: 110px; flex-shrink: 0; font-size: 12px;
          color: var(--color-text-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sb__sub { width: 58px; text-align: right; font-size: 12px; color: var(--color-text-muted); }
        .sb__share { width: 46px; text-align: right; font-size: 12px; color: var(--color-text-muted); }
        .sb__amt { width: 96px; text-align: right; font-weight: 700; }

        .sb__none { font-size: 13px; color: var(--color-text-muted); padding: 8px 0; }

        .sb__more {
          margin-top: 10px; align-self: flex-start;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          border-radius: var(--radius-sm);
          padding: 6px 12px; font-size: 12px; font-weight: 700;
          color: var(--color-text-soft);
        }
        .sb__more:hover { background: var(--color-canvas); }

        @media (max-width: 1100px) {
          .sb__grid { grid-template-columns: 1fr; gap: 22px; }
        }
      `}</style>
    </div>
  );
}
