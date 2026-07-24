import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import StatCardsGrid from '../components/dashboard/StatCardsGrid';
import SalesChart from '../components/dashboard/SalesChart';
import RecentActivity from '../components/dashboard/RecentActivity';
import LiveOrders from '../components/dashboard/LiveOrders';

const LOADING_ERROR_MSG = 'Failed to load dashboard data. Pull to refresh.';

export default function Dashboard() {
  const {
    stats,
    sectionRevenue,
    dailyTrend,
    recentOrders,
    liveOrders,
    loading,
    error,
    refresh,
  } = useDashboardData();

  if (error && !loading) {
    return (
      <div className="error-container">
        <p className="error-text">{LOADING_ERROR_MSG}</p>
        <p className="error-detail">{error}</p>
        <button className="retry-btn" onClick={refresh}>
          <RefreshCw size={14} /> Retry
        </button>
        <style>{`
          .error-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            padding: 4rem 2rem;
            text-align: center;
          }
          .error-text {
            font-weight: 700;
            font-size: 1.1rem;
            color: var(--color-primary);
          }
          .error-detail {
            font-size: 0.85rem;
            color: var(--color-text-muted);
          }
          .retry-btn {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            background: var(--color-primary);
            color: white;
            border: none;
            padding: 0.6rem 1.2rem;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.85rem;
            cursor: pointer;
            margin-top: 0.5rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header-row">
        <div>
          <h3>POS Dashboard</h3>
          <p className="subtitle">
            Real-time performance summary of your restaurant
          </p>
        </div>
        <button className="refresh-btn" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spinner' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      <StatCardsGrid stats={stats} loading={loading} />

      <SalesChart sectionRevenue={sectionRevenue} dailyTrend={dailyTrend} />

      <div className="bottom-grid">
        <RecentActivity orders={recentOrders} loading={loading} />
        <LiveOrders orders={liveOrders} loading={loading} />
      </div>

      <style>{`
        .dashboard-container {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          padding: 1rem 0;
        }
        .dashboard-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .dashboard-header-row h3 {
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--color-primary);
          margin: 0;
        }
        .subtitle {
          font-size: 0.85rem;
          color: var(--color-text-muted);
          margin-top: 0.15rem;
          font-weight: 500;
          margin: 0;
        }
        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: white;
          border: 1px solid var(--color-border);
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--color-primary);
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .refresh-btn:hover:not(:disabled) {
          background: var(--color-accent-soft);
        }
        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
      `}</style>
    </div>
  );
}
