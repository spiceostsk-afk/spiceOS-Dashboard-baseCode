import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import StatCardsGrid from '../components/dashboard/StatCardsGrid';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import SalesChart from '../components/dashboard/SalesChart';
import RecentActivity from '../components/dashboard/RecentActivity';
import LiveOrders from '../components/dashboard/LiveOrders';
import PeriodPicker from '../components/dashboard/PeriodPicker';
import SaleBreakdown from '../components/dashboard/SaleBreakdown';
import { fmtDate } from '../lib/dates';

const LOADING_ERROR_MSG = 'Failed to load dashboard data.';

export default function Dashboard() {
  const {
    stats,
    sectionRevenue,
    channelSplit,
    itemSplit,
    dailyTrend,
    recentOrders,
    liveOrders,
    alerts,
    loading,
    error,
    refresh,
    period,
    setPeriod,
    customRange,
    setCustomRange,
    range,
  } = useDashboardData();

  // What the cards should say they are measuring. Reads as "…today",
  // "…yesterday", "…this month", so each card states its own timeframe rather
  // than leaving the reader to assume one.
  const periodLabel = {
    today: 'today',
    yesterday: 'yesterday',
    this_month: 'this month',
    last_month: 'last month',
    custom: 'in this range',
  }[period] || 'today';

  const dayFmt = (d) => fmtDate(d, '');

  // Spelling out the actual dates matters most for "this month" and "last
  // month", where the boundaries are not obvious at a glance.
  const rangeLabel = range
    ? (dayFmt(range.from) === dayFmt(range.to)
      ? dayFmt(range.from)
      : `${dayFmt(range.from)} – ${dayFmt(range.to)}`)
    : '';

  if (error && !loading) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">{LOADING_ERROR_MSG}</div>
            <div className="empty-state__sub">{error}</div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={refresh}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page dashboard">
      <div className="dashboard__bar">
        <PeriodPicker
          period={period}
          onPeriod={setPeriod}
          customRange={customRange}
          onCustomRange={setCustomRange}
          rangeLabel={rangeLabel}
        />
        <div className="spacer" />
        <button className="btn btn--ghost" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>

      <StatCardsGrid stats={stats} loading={loading} periodLabel={periodLabel} />

      <NeedsAttention alerts={alerts} loading={loading} />

      <div className="dashboard__split">
        <SalesChart
          sectionRevenue={sectionRevenue}
          dailyTrend={dailyTrend}
          periodLabel={periodLabel}
        />
        <RecentActivity orders={recentOrders} loading={loading} />
      </div>

      <SaleBreakdown
        channelSplit={channelSplit}
        itemSplit={itemSplit}
        loading={loading}
        periodLabel={periodLabel}
      />

      <LiveOrders orders={liveOrders} loading={loading} />

      <style>{`
        .dashboard { gap: 20px; }
        .dashboard__bar { display: flex; align-items: center; }

        .dashboard__split {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 16px;
          align-items: stretch;
        }

        @media (max-width: 1100px) {
          .dashboard__split { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
