import React from 'react';
import { RefreshCw, FileText, RotateCcw } from 'lucide-react';

export default function RunningOrdersTab({
  tables,
  loading,
  onResume,
  onReprint,
}) {
  const activeSessions = tables.filter((t) => t.active_session?.session_status === 'active');
  const heldSessions = tables.filter((t) => t.held_session);
  const completedSessions = tables.filter((t) => t.completed_session);

  if (loading) {
    return (
      <div className="tab-loading">
        <RefreshCw className="spinner" /> Loading orders...
        <style>{`
          .tab-loading { display: flex; align-items: center; justify-content: center; gap: 0.75rem; height: 100%; font-weight: 700; color: var(--color-text-muted); padding: 4rem; }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="tab-content">
      <div className="orders-breakdown-grid">
        <div className="orders-summary-card">
          <div className="card-top">
            <div>
              <h5>Active Orders</h5>
              <h2>{activeSessions.length}</h2>
            </div>
          </div>
          {activeSessions.length > 0 ? (
            <div className="card-list">
              {activeSessions.slice(0, 10).map((t) => (
                <div key={t.id} className="list-row session-row">
                  <div className="session-info">
                    <strong>Table {t.table_number}</strong>
                    <span className="session-name">{t.active_session?.customer_name || 'Guest'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">No active orders</p>
          )}
        </div>

        <div className="orders-summary-card held-card">
          <div className="card-top">
            <div>
              <h5>Held Bills</h5>
              <h2>{heldSessions.length}</h2>
            </div>
          </div>
          {heldSessions.length > 0 ? (
            <div className="card-list">
              {heldSessions.slice(0, 10).map((t) => (
                <div key={t.id} className="list-row action-row">
                  <div className="session-info">
                    <strong>Table {t.table_number}</strong>
                    <span className="session-name">{t.held_session?.customer_name || 'Guest'}</span>
                  </div>
                  <div className="row-actions">
                    <button className="action-btn resume-btn" onClick={() => onResume(t.held_session?.id)} title="Resume Bill">
                      <RotateCcw size={14} /> Resume
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">No held bills</p>
          )}
        </div>

        <div className="orders-summary-card completed-card">
          <div className="card-top">
            <div>
              <h5>Completed Bills</h5>
              <h2>{completedSessions.length}</h2>
            </div>
          </div>
          {completedSessions.length > 0 ? (
            <div className="card-list">
              {completedSessions.slice(0, 10).map((t) => (
                <div key={t.id} className="list-row action-row">
                  <div className="session-info">
                    <strong>Table {t.table_number}</strong>
                    <span className="session-name">{t.completed_session?.customer_name || 'Guest'}</span>
                  </div>
                  <div className="row-actions">
                    <button className="action-btn reprint-btn" onClick={() => onReprint(t.completed_session)} title="Reprint Bill">
                      <FileText size={14} /> Reprint
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">No completed bills</p>
          )}
        </div>
      </div>

      <style>{`
        .tab-content { padding: 1.5rem; overflow-y: auto; flex: 1; }
        .orders-breakdown-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
        .orders-summary-card { background: white; border: 1px solid var(--color-border); border-radius: 16px; padding: 1.5rem; box-shadow: var(--shadow-soft); }
        .card-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--color-bg); padding-bottom: 1rem; margin-bottom: 1rem; }
        .card-top h5 { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 700; text-transform: uppercase; }
        .card-top h2 { font-size: 2.2rem; font-weight: 800; color: var(--color-primary); margin-top: 0.15rem; line-height: 1; }
        .card-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 320px; overflow-y: auto; }
        .list-row { display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid var(--color-bg); }
        .list-row:last-child { border-bottom: none; }
        .session-info { display: flex; flex-direction: column; gap: 0.1rem; }
        .session-info strong { font-size: 0.9rem; color: var(--color-primary); }
        .session-name { font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; }
        .row-actions { display: flex; gap: 0.35rem; }
        .action-btn { display: flex; align-items: center; gap: 0.25rem; padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; border: 1px solid var(--color-border); cursor: pointer; }
        .resume-btn { background: #E8F5E9; color: #2E7D32; border-color: #A5D6A7; }
        .reprint-btn { background: #E3F2FD; color: #1565C0; border-color: #90CAF9; }
        .empty-note { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600; text-align: center; padding: 1rem; }
        .held-card .card-top h2 { color: #E65100; }
        .completed-card .card-top h2 { color: #2E7D32; }
      `}</style>
    </div>
  );
}