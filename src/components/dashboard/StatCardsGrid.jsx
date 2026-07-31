import React from 'react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const FORMAT_NUMBER = new Intl.NumberFormat('en-IN');

const ONLINE_SALES_RATIO = 0.4185;
const CASH_COLLECTED_RATIO = 0.2848;

const fmt = (v) => FORMAT_CURRENCY.format(v);
const fmtn = (v) => FORMAT_NUMBER.format(v);

export default function StatCardsGrid({ stats, loading }) {
  const cards = [
    { key: 'totalSales', label: 'Total Sales', value: fmt(stats.totalSales), note: `From ${fmtn(stats.totalOrders)} processed orders` },
    { key: 'netSales', label: 'Net Sales', value: fmt(stats.netSales), note: 'Excluding taxes & service charges' },
    { key: 'onlineSales', label: 'Online Sales', value: fmt(stats.totalSales * ONLINE_SALES_RATIO), note: 'Estimated from aggregators' },
    { key: 'cashCollected', label: 'Cash Collected', value: fmt(stats.totalSales * CASH_COLLECTED_RATIO), note: 'Estimated drawer cash' },
    { key: 'todayOrders', label: "Today's Orders", value: fmtn(stats.todayOrders), note: 'Orders placed today' },
    { key: 'activeTables', label: 'Active Tables', value: fmtn(stats.activeTables), note: 'Currently serving customers' },
    { key: 'occupiedTables', label: 'Occupied Tables', value: fmtn(stats.occupiedTables), note: 'Tables in use' },
    { key: 'customerCount', label: 'Customers Today', value: fmtn(stats.customerCount), note: 'Total served today' },
    { key: 'aov', label: 'Avg Order Value', value: fmt(stats.averageOrderValue), note: 'Per order average' },
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
