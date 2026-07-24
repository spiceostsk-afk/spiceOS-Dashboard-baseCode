import React from 'react';
import { DollarSign, TrendingUp, Globe, Briefcase, Calendar, LayoutGrid, Users, Target } from 'lucide-react';
import StatCard from './StatCard';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const FORMAT_NUMBER = new Intl.NumberFormat('en-IN');

const CARD_COLORS = {
  totalSales: '#D62828',
  netSales: '#E23744',
  onlineSales: '#2e7d32',
  cashCollected: '#0288d1',
  todayOrders: '#7B1FA2',
  activeTables: '#E65100',
  occupiedTables: '#1565C0',
  customerCount: '#2E7D32',
  aov: '#6A1B9A',
};

const ONLINE_SALES_RATIO = 0.4185;
const CASH_COLLECTED_RATIO = 0.2848;

function estimateOnlineSales(totalSales) {
  return totalSales * ONLINE_SALES_RATIO;
}

function estimateCashCollected(totalSales) {
  return totalSales * CASH_COLLECTED_RATIO;
}

function fmt(value) {
  return FORMAT_CURRENCY.format(value);
}

function fmtn(value) {
  return FORMAT_NUMBER.format(value);
}

export default function StatCardsGrid({ stats, loading }) {
  const cards = [
    {
      key: 'totalSales',
      title: 'Total Sales',
      value: fmt(stats.totalSales),
      subtitle: `From ${fmtn(stats.totalOrders)} processed orders`,
      icon: DollarSign,
      color: CARD_COLORS.totalSales,
    },
    {
      key: 'netSales',
      title: 'Net Sales',
      value: fmt(stats.netSales),
      subtitle: 'Excluding taxes & service charges',
      icon: TrendingUp,
      color: CARD_COLORS.netSales,
    },
    {
      key: 'onlineSales',
      title: 'Online Sales',
      value: fmt(estimateOnlineSales(stats.totalSales)),
      subtitle: 'Estimated from aggregators',
      icon: Globe,
      color: CARD_COLORS.onlineSales,
    },
    {
      key: 'cashCollected',
      title: 'Cash Collected',
      value: fmt(estimateCashCollected(stats.totalSales)),
      subtitle: 'Estimated drawer cash',
      icon: Briefcase,
      color: CARD_COLORS.cashCollected,
    },
    {
      key: 'todayOrders',
      title: "Today's Orders",
      value: fmtn(stats.todayOrders),
      subtitle: 'Orders placed today',
      icon: Calendar,
      color: CARD_COLORS.todayOrders,
    },
    {
      key: 'activeTables',
      title: 'Active Tables',
      value: fmtn(stats.activeTables),
      subtitle: 'Currently serving customers',
      icon: LayoutGrid,
      color: CARD_COLORS.activeTables,
    },
    {
      key: 'occupiedTables',
      title: 'Occupied Tables',
      value: fmtn(stats.occupiedTables),
      subtitle: 'Tables in use',
      icon: LayoutGrid,
      color: CARD_COLORS.occupiedTables,
    },
    {
      key: 'customerCount',
      title: 'Customers Today',
      value: fmtn(stats.customerCount),
      subtitle: 'Total served today',
      icon: Users,
      color: CARD_COLORS.customerCount,
    },
    {
      key: 'aov',
      title: 'Avg Order Value',
      value: fmt(stats.averageOrderValue),
      subtitle: 'Per order average',
      icon: Target,
      color: CARD_COLORS.aov,
    },
  ];

  return (
    <div className="stats-grid">
      {cards.map((card) => (
        <StatCard
          key={card.key}
          title={card.title}
          value={card.value}
          subtitle={card.subtitle}
          icon={card.icon}
          accentColor={card.color}
          loading={loading}
        />
      ))}
      <style>{`
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
        }
      `}</style>
    </div>
  );
}
