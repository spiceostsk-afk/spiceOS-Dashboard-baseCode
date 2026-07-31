import React from 'react';
import { useNavigate } from 'react-router-dom';

const SEVERITY = {
  warning: { rail: 'var(--color-warning)', bg: '#FDF6EC', border: '#F5E3C8', color: 'var(--color-warning)' },
  danger: { rail: 'var(--color-danger)', bg: 'var(--color-danger-soft)', border: 'var(--color-danger-border)', color: 'var(--color-danger)' },
};

export default function NeedsAttention({ alerts, loading }) {
  const navigate = useNavigate();

  if (loading) return null;

  if (!alerts || alerts.length === 0) {
    return (
      <div className="attention attention--clear">
        <span className="attention__check">✓</span>
        <div>
          <div className="attention__clear-title">All running smoothly</div>
          <div className="card__subtitle">No stuck tables or voided orders right now.</div>
        </div>
        <AttentionStyles />
      </div>
    );
  }

  return (
    <div className="attention">
      <div className="attention__head">
        <span className="attention__dot" />
        <div className="card__title">Needs attention</div>
        <div className="card__subtitle">{alerts.length} item{alerts.length === 1 ? '' : 's'}</div>
      </div>

      <div className="attention__list">
        {alerts.map((a) => {
          const s = SEVERITY[a.severity] || SEVERITY.warning;
          return (
            <div
              key={a.id}
              className="attention__row"
              style={{ background: s.bg, borderColor: s.border }}
            >
              <span className="attention__glyph" style={{ color: s.color }}>{a.glyph}</span>
              <div className="attention__text">
                <div className="attention__title">{a.title}</div>
                <div className="card__subtitle">{a.detail}</div>
              </div>
              <button className="link-action" onClick={() => navigate(a.to)}>View →</button>
            </div>
          );
        })}
      </div>

      <AttentionStyles />
    </div>
  );
}

function AttentionStyles() {
  return (
    <style>{`
      .attention {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-left: 3px solid var(--color-warning);
        border-radius: var(--radius-lg);
        padding: 20px 24px;
      }

      .attention--clear {
        display: flex;
        align-items: center;
        gap: 14px;
        border-left-color: var(--color-success);
      }

      .attention__check {
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        border-radius: var(--radius-sm);
        background: var(--color-success-soft);
        color: var(--color-success);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: 700;
      }

      .attention__clear-title { font-size: 15px; font-weight: 700; color: var(--color-success); }

      .attention__head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }

      .attention__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-warning);
      }

      .attention__list { display: flex; flex-direction: column; gap: 8px; }

      .attention__row {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        border-radius: var(--radius-md);
        border: 1px solid transparent;
      }

      .attention__glyph {
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 700;
      }

      .attention__text { flex: 1; min-width: 0; }
      .attention__title { font-size: 14px; font-weight: 600; color: var(--color-text); }
    `}</style>
  );
}
