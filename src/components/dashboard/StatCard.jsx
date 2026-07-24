import React from 'react';
import { RefreshCw } from 'lucide-react';

const ICON_WRAPPER_SIZE = 44;
const ICON_SIZE = 22;

export default function StatCard({ title, value, subtitle, icon: Icon, accentColor, loading }) {
  if (loading) {
    return (
      <div className="stat-card" style={{ borderLeft: `4px solid ${accentColor}` }}>
        <div className="card-body">
          <div className="card-text">
            <span className="card-title">{title}</span>
            <span className="card-loading">
              <RefreshCw size={16} className="spinner" />
            </span>
            <span className="card-sub">&nbsp;</span>
          </div>
          <div className="card-icon-wrapper" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
            <Icon size={ICON_SIZE} />
          </div>
        </div>
      </div>
    );
  }

  const displayValue = value == null ? '\u2014' : value;

  return (
    <div className="stat-card" style={{ borderLeft: `4px solid ${accentColor}` }}>
      <div className="card-body">
        <div className="card-text">
          <span className="card-title">{title}</span>
          <span className="card-value">{displayValue}</span>
          {subtitle && <span className="card-sub">{subtitle}</span>}
        </div>
        <div className="card-icon-wrapper" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
          <Icon size={ICON_SIZE} />
        </div>
      </div>
      <style>{`
        .stat-card {
          background: white;
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 1.25rem 1.5rem;
          box-shadow: var(--shadow-soft);
          transition: var(--transition-smooth);
        }
        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(78, 62, 47, 0.08);
        }
        .card-body {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .card-text {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .card-title {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .card-value {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--color-primary);
          letter-spacing: -0.5px;
        }
        .card-sub {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          font-weight: 500;
        }
        .card-icon-wrapper {
          width: ${ICON_WRAPPER_SIZE}px;
          height: ${ICON_WRAPPER_SIZE}px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-loading {
          display: flex;
          align-items: center;
          height: 2rem;
        }
        .spinner {
          animation: spin 1s linear infinite;
          color: var(--color-text-muted);
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
