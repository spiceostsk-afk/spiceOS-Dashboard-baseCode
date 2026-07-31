import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import StatCardsGrid from '../components/dashboard/StatCardsGrid';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import SalesChart from '../components/dashboard/SalesChart';
import RecentActivity from '../components/dashboard/RecentActivity';
import LiveOrders from '../components/dashboard/LiveOrders';

const LOADING_ERROR_MSG = 'Failed to load dashboard data.';

export default function Dashboard() {
  const {
    stats,
    sectionRevenue,
    dailyTrend,
    recentOrders,
    liveOrders,
    alerts,
    loading,
    error,
    refresh,
  } = useDashboardData();

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
        <div className="spacer" />
        <button className="btn btn--ghost" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>

      <StatCardsGrid stats={stats} loading={loading} />

      <NeedsAttention alerts={alerts} loading={loading} />

      <div className="dashboard__split">
        <SalesChart sectionRevenue={sectionRevenue} dailyTrend={dailyTrend} />
        <RecentActivity orders={recentOrders} loading={loading} />
      </div>

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
