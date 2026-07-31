import React from 'react';
import { Package } from 'lucide-react';
import { useInventoryData } from '../hooks/useInventoryData';

const STATUS = {
  in: { label: 'In stock', tone: 'tone-green', row: 'transparent' },
  low: { label: 'Low', tone: 'tone-amber', row: '#FDFAF3' },
  out: { label: 'Out', tone: 'tone-red', row: '#FDF6F6' },
};

const statusOf = (item) => {
  if (item.stock <= 0) return STATUS.out;
  if (item.stock <= item.reorderAt) return STATUS.low;
  return STATUS.in;
};

export default function Inventory() {
  const { items, metrics, loading, adjust } = useInventoryData();

  const cards = [
    { label: 'Items tracked', value: metrics.tracked, color: 'var(--color-text)' },
    { label: 'Low stock', value: metrics.low, color: 'var(--color-warning)' },
    { label: 'Out of stock', value: metrics.out, color: 'var(--color-danger)' },
  ];

  return (
    <div className="page">
      <div className="inv-top">
        <div className="metric-grid metric-grid--3" style={{ flex: 1 }}>
          {cards.map((c) => (
            <div key={c.label} className="metric-card">
              <div className="metric-card__label">{c.label}</div>
              <div className="metric-card__value" style={{ color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
        <div className="inv-actions">
          <button className="btn btn--ghost">Stock in/out log</button>
          <button className="btn btn--primary">+ Add item</button>
        </div>
      </div>

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="c-item">Item</div>
          <div className="c-cat">Category</div>
          <div className="c-num">In stock</div>
          <div className="c-num">Reorder at</div>
          <div className="c-status">Status</div>
          <div className="c-updated">Last updated</div>
          <div className="c-adjust">Adjust</div>
        </div>

        {loading && <div className="empty-state">Loading inventory…</div>}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Package size={22} /></span>
            <div className="empty-state__title">No items tracked yet</div>
            <div className="empty-state__sub">
              Add your first item to start tracking stock levels and reorder alerts.
            </div>
          </div>
        )}

        {!loading && items.map((item) => {
          const s = statusOf(item);
          return (
            <div key={item.id} className="table-row inv-row" style={{ background: s.row }}>
              <div className="c-item strong">{item.name}</div>
              <div className="c-cat muted">{item.category}</div>
              <div className="c-num strong tnum">{item.stock} {item.unit}</div>
              <div className="c-num muted tnum">{item.reorderAt} {item.unit}</div>
              <div className="c-status"><span className={`pill ${s.tone}`}>{s.label}</span></div>
              <div className="c-updated muted">{item.updatedAt}</div>
              <div className="c-adjust">
                <button className="step" onClick={() => adjust(item.id, -1)}>−</button>
                <button className="step" onClick={() => adjust(item.id, +1)}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .inv-top { display: flex; align-items: flex-start; gap: 16px; }
        .inv-actions { display: flex; gap: 8px; padding-top: 4px; }
        .inv-row { margin: 0 -24px; padding: 0 24px; }

        .c-item { flex: 1.4; min-width: 0; }
        .c-cat { flex: 1; min-width: 0; }
        .c-num { width: 100px; text-align: right; }
        .c-status { width: 100px; }
        .c-updated { width: 110px; font-size: 12.5px; }
        .c-adjust { width: 90px; display: flex; justify-content: center; gap: 6px; }

        .step {
          width: 26px;
          height: 26px;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          background: var(--color-surface);
          color: var(--color-text-muted);
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .step:hover { background: var(--color-canvas); color: var(--color-text); }
      `}</style>
    </div>
  );
}
