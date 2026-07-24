import React from 'react';
import { RefreshCw, Clock, XCircle } from 'lucide-react';

function TableCard({ table, isSelected, onClick, onFreeTable }) {
  const session = table.active_session;

  return (
    <div
      className={`table-pos-card status-${table.status} ${isSelected ? 'selected-table' : ''}`}
      onClick={() => onClick(table)}
    >
      <div className="table-header">
        <span className="table-num">T - {table.table_number}</span>
        <span className="table-capacity">{table.capacity} Pax</span>
      </div>

      <div className="table-body">
        {session ? (
          <>
            <p className="guest-name">{session.customer_name || 'Guest'}</p>
            <div className="time-elapsed">
              <Clock size={12} />
              <span>{Math.floor((Date.now() - new Date(session.started_at).getTime()) / 60000)} mins</span>
            </div>
          </>
        ) : (
          <p className="vacant-text">Vacant</p>
        )}
      </div>

      <div className="status-label">
        {table.status === 'cleaning' && onFreeTable && (
          <button
            className="free-btn"
            onClick={(e) => { e.stopPropagation(); onFreeTable(table.id); }}
            title="Free table"
          >
            <XCircle size={12} /> Free
          </button>
        )}
        <span>{table.status.toUpperCase()}</span>
      </div>
      <style>{`
        .table-pos-card {
          background: white;
          border: 1px solid var(--color-border);
          border-radius: 14px;
          padding: 1rem;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 120px;
          position: relative;
          box-shadow: var(--shadow-soft);
          transition: var(--transition-smooth);
        }
        .table-pos-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.06);
        }
        .selected-table {
          outline: 2.5px solid var(--color-primary);
          outline-offset: -1px;
        }
        .table-header { display: flex; justify-content: space-between; align-items: center; }
        .table-num { font-size: 1rem; font-weight: 800; color: var(--color-primary); }
        .table-capacity { font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted); }
        .table-body { margin-top: 0.5rem; flex: 1; }
        .guest-name { font-size: 0.8rem; font-weight: 700; color: var(--color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
        .time-elapsed { display: flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; color: var(--color-text-muted); margin-top: 0.15rem; font-weight: 600; }
        .vacant-text { color: #bdbdbd; font-size: 0.8rem; font-weight: 700; }
        .status-label { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.5px; text-align: right; margin-top: auto; display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; }
        .free-btn { display: inline-flex; align-items: center; gap: 0.2rem; background: #00796B; color: white; border: none; border-radius: 4px; padding: 0.15rem 0.4rem; font-size: 0.6rem; font-weight: 700; cursor: pointer; }
        .free-btn:hover { background: #004D40; }
        .status-available .status-label { color: #888; }
        .status-occupied { background: rgba(197, 168, 128, 0.08); border-color: var(--color-accent); }
        .status-occupied .status-label { color: var(--color-accent); }
        .status-billing { background: #FFF9C4; border-color: #FBC02D; }
        .status-billing .status-label { color: #F57F17; }
        .status-cleaning { background: #E0F2F1; border-color: #4DB6AC; }
        .status-cleaning .status-label { color: #00796B; }
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
      <div className="tab-content">
        <p className="error-text">Failed to load tables: {error}</p>
        <style>{`
          .tab-content { padding: 1.5rem; overflow-y: auto; flex: 1; }
          .error-text { color: var(--color-text-muted); font-weight: 600; text-align: center; padding: 2rem; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="tab-content">
      <div className="area-selector">
        <button
          className={`area-btn ${activeArea === 'all' ? 'active' : ''}`}
          onClick={() => onSelectArea('all')}
        >
          All Areas
        </button>
        {sections.map((s) => (
          <button
            key={s.id}
            className={`area-btn ${activeArea === s.id ? 'active' : ''}`}
            onClick={() => onSelectArea(s.id)}
          >
            {s.section_name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="tab-loading">
          <RefreshCw className="spinner" /> Loading tables layout...
        </div>
      ) : tables.length === 0 ? (
        <p className="no-tables">No tables found in this area.</p>
      ) : (
        <div className="tables-grid">
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
        .tab-content { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; overflow-y: auto; flex: 1; }
        .area-selector { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .area-btn { padding: 0.45rem 1rem; border-radius: 20px; border: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); background: white; cursor: pointer; transition: var(--transition-smooth); }
        .area-btn:hover { background: var(--color-accent-soft); color: var(--color-primary); }
        .area-btn.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
        .tables-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 1rem; }
        .tab-loading { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 4rem; font-weight: 700; color: var(--color-text-muted); }
        .spinner { animation: spin 1s linear infinite; }
        .no-tables { text-align: center; padding: 3rem; color: var(--color-text-muted); font-weight: 600; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
