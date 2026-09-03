import React from 'react';
import { Calendar } from 'lucide-react';


/** The periods offered, in the order a manager tends to want them. */
const DASHBOARD_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom range' },
];

/**
 * Which stretch of time the dashboard is reporting on.
 *
 * The custom inputs appear only when Custom is chosen, so the common case —
 * "how did today go" — stays a single click rather than two date fields.
 *
 * Dates are plain local days. A sale at 11pm belongs to that evening's trade,
 * not to tomorrow, so the boundaries are the restaurant's own midnight rather
 * than UTC's.
 */
export default function PeriodPicker({ period, onPeriod, customRange, onCustomRange, rangeLabel }) {
  const today = new Date();
  const maxDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="pp">
      <div className="segmented pp__seg">
        {DASHBOARD_PERIODS.map((p) => (
          <button
            key={p.key}
            className={period === p.key ? 'on' : ''}
            onClick={() => onPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="pp__custom">
          <label>
            <span>From</span>
            <input
              type="date"
              value={customRange.from}
              max={maxDay}
              onChange={(e) => onCustomRange({ ...customRange, from: e.target.value })}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={customRange.to}
              max={maxDay}
              onChange={(e) => onCustomRange({ ...customRange, to: e.target.value })}
            />
          </label>
        </div>
      )}

      {rangeLabel && (
        <div className="pp__label">
          <Calendar size={13} /> {rangeLabel}
        </div>
      )}

      <style>{`
        .pp { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .pp__seg { flex-wrap: wrap; }
        .pp__custom { display: flex; gap: 10px; }
        .pp__custom label {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 600; color: var(--color-text-muted);
        }
        .pp__custom input {
          height: 34px; padding: 0 9px; font: inherit; font-size: 13px;
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          background: var(--color-surface); color: var(--color-text);
        }
        .pp__label {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; font-weight: 600; color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
