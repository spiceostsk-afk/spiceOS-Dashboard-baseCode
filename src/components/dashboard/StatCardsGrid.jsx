import React from 'react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const FORMAT_NUMBER = new Intl.NumberFormat('en-IN');

const fmt = (v) => FORMAT_CURRENCY.format(v);
const fmtn = (v) => FORMAT_NUMBER.format(v);

/**
 * The four headline figures.
 *
 * Three of them report the selected period and say so on the card. This used
 * to be the screen's quietest bug: Total Sales was all-time while Orders Today
 * was today, sitting side by side with nothing to tell them apart, so the row
 * read as though it were all one timeframe.
 *
 * Active tables is the exception and stays live. It answers "what is happening
 * on the floor right now", which a date range has no bearing on — so it is
 * labelled "right now" rather than silently ignoring the period.
 */
export default function StatCardsGrid({ stats, loading, periodLabel = 'today' }) {
  const cards = [
    {
      key: 'totalSales',
      label: 'Total sales',
      value: fmt(stats.totalSales),
      note: `From ${fmtn(stats.totalOrders)} order${stats.totalOrders === 1 ? '' : 's'} ${periodLabel}`,
    },
    {
      key: 'periodOrders',
      label: 'Orders',
      value: fmtn(stats.periodOrders),
      note: `Placed ${periodLabel}`,
    },
    {
      key: 'activeTables',
      label: 'Active tables',
      value: fmtn(stats.activeTables),
      note: 'Currently serving — right now',
    },
    {
      key: 'averageBill',
      label: 'Average bill',
      value: fmt(stats.averageOrderValue),
      note: `Per order ${periodLabel}`,
    },
  ];

  return (
    <div className="metric-grid metric-grid--4">
      {cards.map((card) => (
        <div key={card.key} className="metric-card">
          <div className="metric-card__label">{card.label}</div>
          <div className="metric-card__value">{loading ? '—' : card.value}</div>
          <div className="metric-card__foot"><span>{card.note}</span></div>
        </div>
      ))}
    </div>
  );
}
