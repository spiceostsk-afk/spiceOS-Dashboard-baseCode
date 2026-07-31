import React from 'react';
import { RefreshCw, LayoutGrid } from 'lucide-react';

/**
 * Table status → the strip colour and pill tone used across the POS.
 * Kept in one place so the floor, the header counts and the badges agree.
 */
const STATUS = {
  available: { strip: '#C9CDD5', tone: 'tone-neutral', label: 'Available' },
  occupied: { strip: 'var(--color-info)', tone: 'tone-blue', label: 'Dining' },
  billing: { strip: 'var(--color-warning)', tone: 'tone-amber', label: 'Bill ready' },
  cleaning: { strip: 'var(--color-success)', tone: 'tone-green', label: 'Cleaning' },
};

const STALE_MINUTES = 45;

const minutesSince = (iso) => {
  if (!iso) return null;
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff)) : null;
};

function TableCard({ table, isSelected, onClick, onFreeTable }) {
  const session = table.active_session;
  const s = STATUS[table.status] || STATUS.available;
  const min = session ? minutesSince(session.started_at) : null;
  const late = min !== null && min > STALE_MINUTES;

  return (
    <div
      className={`tw-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onClick(table)}
    >
      <div className="tw-strip" style={{ background: s.strip }} />
      <div className="tw-body">
        <div className="tw-top">
          <div className="tw-id">T{table.table_number}</div>
          <div
            className="tw-min tnum"
            style={{ color: late ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
          >
            {min === null ? `${table.capacity} pax` : `${min} min`}
          </div>
        </div>

        <div className="tw-guest">
          {session ? (session.customer_name || 'Walk-in guest') : 'Vacant'}
        </div>

        <div className="tw-foot">
          <span className={`pill pill--sm ${s.tone}`}>{s.label}</span>
          {table.status === 'cleaning' && onFreeTable && (
            <button
              className="tw-free"
              onClick={(e) => { e.stopPropagation(); onFreeTable(table.id); }}
              title="Free table"
            >
              Free
            </button>
          )}
        </div>
      </div>

      <style>{`
        .tw-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 14px;
          overflow: hidden;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .tw-card:hover { border-color: var(--color-border-strong); }
        .tw-card.is-selected {
          border-color: var(--color-text);
          box-shadow: 0 0 0 1px var(--color-text);
        }
        .tw-strip { height: 4px; }
        .tw-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
        .tw-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .tw-id { font-size: 18px; font-weight: 800; }
        .tw-min { font-size: 12px; font-weight: 600; white-space: nowrap; }
        .tw-guest {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tw-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .tw-free {
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          border-radius: 8px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 700;
          color: var(--color-text-soft);
        }
        .tw-free:hover { background: var(--color-canvas); }
      `}</style>
    </div>
  );
}

export default function TablesWorkspace({
  tables,
  sections,
  activeArea,
  loading,
  error,
  selectedSessionId,
  sessionTableId,
  onSelectArea,
  onTableClick,
  onFreeTable,
}) {
  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state__title">Couldn’t load tables</div>
          <div className="empty-state__sub">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw">
      <div className="chip-row">
        <button
          className={`chip ${activeArea === 'all' ? 'on' : ''}`}
          onClick={() => onSelectArea('all')}
        >
          All areas
        </button>
        {sections.map((s) => (
          <button
            key={s.id}
            className={`chip ${activeArea === s.id ? 'on' : ''}`}
            onClick={() => onSelectArea(s.id)}
          >
            {s.section_name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading floor layout…</div>
          </div>
        </div>
      ) : tables.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state__mark"><LayoutGrid size={22} /></span>
            <div className="empty-state__title">No tables in this area</div>
            <div className="empty-state__sub">Pick another area, or add tables in QR Codes.</div>
          </div>
        </div>
      ) : (
        <div className="tw-grid">
          {tables.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              isSelected={selectedSessionId && sessionTableId === t.id}
              onClick={onTableClick}
              onFreeTable={onFreeTable}
            />
          ))}
        </div>
      )}

      <style>{`
        .tw { display: flex; flex-direction: column; gap: 14px; }
        .tw-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }
      `}</style>
    </div>
  );
}
