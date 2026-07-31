import React from 'react';

const AGGREGATORS = [
  { key: 'zomato', label: 'Zomato integration', desc: 'Turn visibility on the Zomato platform on or off' },
  { key: 'swiggy', label: 'Swiggy integration', desc: 'Turn visibility on the Swiggy platform on or off' },
];

export default function StoreActionsTab({ aggregators, onToggleAggregator, cleaningCount, onFreeAllCleaning }) {
  return (
    <div className="sa">
      <div className="card">
        <div className="card__title">Aggregator integrations</div>
        <div className="card__subtitle" style={{ marginBottom: 14 }}>
          Control where this outlet accepts online orders from.
        </div>

        {AGGREGATORS.map((agg) => (
          <div key={agg.key} className="sa-row">
            <div className="sa-row__text">
              <div className="sa-row__title">{agg.label}</div>
              <div className="card__subtitle">{agg.desc}</div>
            </div>
            <span className={`pill ${aggregators[agg.key] ? 'tone-green' : 'tone-neutral'}`}>
              {aggregators[agg.key] ? 'Online' : 'Offline'}
            </span>
            <button
              type="button"
              className={`toggle ${aggregators[agg.key] ? 'on' : ''}`}
              onClick={() => onToggleAggregator(agg.key)}
              aria-pressed={!!aggregators[agg.key]}
              aria-label={agg.label}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card__title">Table management</div>
        <div className="card__subtitle" style={{ marginBottom: 14 }}>
          Bulk actions across the floor.
        </div>

        <div className="sa-row">
          <div className="sa-row__text">
            <div className="sa-row__title">Free all cleaning tables</div>
            <div className="card__subtitle">
              {cleaningCount > 0
                ? `${cleaningCount} table${cleaningCount > 1 ? 's' : ''} currently being cleaned`
                : 'No tables in cleaning'}
            </div>
          </div>
          <button className="btn btn--ghost" onClick={onFreeAllCleaning} disabled={cleaningCount === 0}>
            Free all
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card__title">Out of stock alerts</div>
        <div className="card__subtitle" style={{ marginTop: 4 }}>
          All menu items are currently in stock.
        </div>
      </div>

      <style>{`
        .sa { display: flex; flex-direction: column; gap: 16px; }

        .sa-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid var(--color-border-soft);
        }
        .sa-row:last-child { border-bottom: none; padding-bottom: 0; }

        .sa-row__text { flex: 1; min-width: 0; }
        .sa-row__title { font-size: 13.5px; font-weight: 600; color: var(--color-text); }
      `}</style>
    </div>
  );
}
