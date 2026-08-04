import React from 'react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const FORMAT_NUMBER = new Intl.NumberFormat('en-IN');

const fmt = (v) => FORMAT_CURRENCY.format(v);
const fmtn = (v) => FORMAT_NUMBER.format(v);

export default function StatCardsGrid({ stats, loading }) {
  const cards = [
    { key: 'totalSales', label: 'Total sales', value: fmt(stats.totalSales), note: `From ${fmtn(stats.totalOrders)} processed orders` },
    { key: 'todayOrders', label: 'Orders today', value: fmtn(stats.todayOrders), note: 'Orders placed today' },
    { key: 'activeTables', label: 'Active tables', value: fmtn(stats.activeTables), note: 'Currently serving customers' },
    { key: 'averageBill', label: 'Average bill', value: fmt(stats.averageOrderValue), note: 'Per order average' },
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
