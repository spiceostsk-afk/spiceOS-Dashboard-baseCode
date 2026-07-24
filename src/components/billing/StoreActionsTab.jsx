import React from 'react';

const AGGREGATORS = [
  { key: 'zomato', label: 'Zomato Integration', desc: 'Turn ON/OFF visibility on Zomato platform' },
  { key: 'swiggy', label: 'Swiggy Integration', desc: 'Turn ON/OFF visibility on Swiggy platform' },
];

export default function StoreActionsTab({ aggregators, onToggleAggregator, cleaningCount, onFreeAllCleaning }) {
  return (
    <div className="tab-content">
      <h4>Aggregators Integrations & Status</h4>
      <div className="actions-switches">
        {AGGREGATORS.map((agg) => (
          <div key={agg.key} className="switch-row">
            <div className="switch-label">
              <strong>{agg.label}</strong>
              <p>{agg.desc}</p>
            </div>
            <button
              className={`toggle-switch ${aggregators[agg.key] ? 'active' : ''}`}
              onClick={() => onToggleAggregator(agg.key)}
            >
              {aggregators[agg.key] ? 'ONLINE' : 'OFFLINE'}
            </button>
          </div>
        ))}
      </div>

      <h4 className="stock-header">Table Management</h4>
      <div className="table-actions">
        <div className="action-row">
          <div className="action-label">
            <strong>Free All Cleaning Tables</strong>
            <p>{cleaningCount > 0 ? `${cleaningCount} table${cleaningCount > 1 ? 's' : ''} currently in cleaning status` : 'No tables in cleaning'}</p>
          </div>
          <button className="free-btn" onClick={onFreeAllCleaning} disabled={cleaningCount === 0}>
            Free All
          </button>
        </div>
      </div>

      <h4 className="stock-header">Out of Stock Alerts</h4>
      <div className="stock-alerts">
        <p className="no-data">All menu items are currently in stock.</p>
      </div>

      <style>{`
        .tab-content { padding: 1.5rem; overflow-y: auto; flex: 1; }
        h4 { font-size: 1.05rem; font-weight: 700; color: var(--color-primary); }
        .actions-switches { display: flex; flex-direction: column; gap: 1rem; max-width: 440px; margin-top: 1rem; }
        .switch-row { background: white; border: 1px solid var(--color-border); padding: 1rem; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
        .switch-label strong { font-size: 0.9rem; color: var(--color-primary); }
        .switch-label p { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.15rem; }
        .toggle-switch { border: none; padding: 0.5rem 1.25rem; border-radius: 20px; font-weight: 800; font-size: 0.75rem; cursor: pointer; background: #EEEEEE; color: #666; }
        .toggle-switch.active { background: #E8F5E9; color: #2E7D32; }
        .stock-header { margin-top: 2.5rem; }
        .table-actions { margin-top: 1rem; max-width: 440px; }
        .action-row { background: white; border: 1px solid var(--color-border); padding: 1rem; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
        .action-label strong { font-size: 0.9rem; color: var(--color-primary); }
        .action-label p { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.15rem; }
        .free-btn { background: #E8F5E9; color: #2E7D32; border: 1px solid #A5D6A7; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 800; font-size: 0.75rem; cursor: pointer; }
        .free-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .no-data { color: var(--color-text-muted); font-weight: 600; font-size: 0.9rem; margin-top: 0.75rem; }
      `}</style>
    </div>
  );
}
