import React from 'react';
import { RefreshCw, FileText, RotateCcw } from 'lucide-react';

function OrdersColumn({ label, count, countColor, rows, emptyNote, renderAction }) {
  return (
    <div className="card ro-card">
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value" style={{ color: countColor }}>{count}</div>

      {rows.length === 0 ? (
        <div className="ro-empty">{emptyNote}</div>
      ) : (
        <div className="ro-list">
          {rows.map(({ key, table, name, payload }) => (
            <div key={key} className="ro-row">
              <div className="ro-row__main">
                <div className="ro-row__table">Table {table}</div>
                <div className="ro-row__name">{name}</div>
              </div>
              {renderAction && renderAction(payload)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RunningOrdersTab({ tables, loading, onResume, onReprint }) {
  if (loading) {
    return (
      <div className="card">
        <div className="empty-state">
          <RefreshCw size={20} className="spin" />
          <div className="empty-state__sub">Loading orders…</div>
        </div>
      </div>
    );
  }

  const active = tables
    .filter((t) => t.active_session?.session_status === 'active')
    .slice(0, 10)
    .map((t) => ({
      key: t.id,
      table: t.table_number,
      name: t.active_session?.customer_name || 'Walk-in guest',
    }));

  const held = tables
    .filter((t) => t.held_session)
    .slice(0, 10)
    .map((t) => ({
      key: t.id,
      table: t.table_number,
      name: t.held_session?.customer_name || 'Walk-in guest',
      payload: t.held_session,
    }));

  const completed = tables
    .filter((t) => t.completed_session)
    .slice(0, 10)
    .map((t) => ({
      key: t.id,
      table: t.table_number,
      name: t.completed_session?.customer_name || 'Walk-in guest',
      payload: t.completed_session,
    }));

  return (
    <div className="ro-grid">
      <OrdersColumn
        label="Active orders"
        count={tables.filter((t) => t.active_session?.session_status === 'active').length}
        countColor="var(--color-text)"
        rows={active}
        emptyNote="No active orders"
      />

      <OrdersColumn
        label="Held bills"
        count={tables.filter((t) => t.held_session).length}
        countColor="var(--color-warning)"
        rows={held}
        emptyNote="No held bills"
        renderAction={(session) => (
          <button className="btn btn--ghost btn--sm" onClick={() => onResume(session?.id)}>
            <RotateCcw size={13} /> Resume
          </button>
        )}
      />

      <OrdersColumn
        label="Completed bills"
        count={tables.filter((t) => t.completed_session).length}
        countColor="var(--color-success)"
        rows={completed}
        emptyNote="No completed bills"
        renderAction={(session) => (
          <button className="btn btn--ghost btn--sm" onClick={() => onReprint(session)}>
            <FileText size={13} /> Reprint
          </button>
        )}
      />

      <style>{`
        .ro-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .ro-card { display: flex; flex-direction: column; gap: 10px; }

        .ro-list {
          display: flex;
          flex-direction: column;
          max-height: 320px;
          overflow-y: auto;
          margin-top: 4px;
        }

        .ro-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 0;
          border-bottom: 1px solid var(--color-border-soft);
        }
        .ro-row:last-child { border-bottom: none; }

        .ro-row__main { flex: 1; min-width: 0; }
        .ro-row__table { font-size: 13.5px; font-weight: 600; }
        .ro-row__name {
          font-size: 12.5px;
          color: var(--color-text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ro-empty {
          font-size: 13px;
          color: var(--color-text-muted);
          text-align: center;
          padding: 24px 0;
        }
      `}</style>
    </div>
  );
}
