import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * The furniture both master screens share: a horizontally scrolling strip of
 * category tabs with live counts, a pager, and a bulk-action bar.
 *
 * The counts are the point of the strip. A master list is where someone goes
 * to find out how much of something they have, so the tab says it before you
 * click it.
 */

/* ------------------------------------------------------------- Category tabs */
export function CategoryStrip({ tabs, active, onSelect, unit = 'items' }) {
  const railRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = () => {
    const el = railRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [tabs.length]);

  const nudge = (dir) => {
    railRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  return (
    <div className="cstrip">
      {edges.left && (
        <button className="cstrip__arrow cstrip__arrow--l" onClick={() => nudge(-1)} aria-label="Scroll left">
          <ChevronLeft size={16} />
        </button>
      )}

      <div className="cstrip__rail" ref={railRef}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`ctab ${active === t.key ? 'on' : ''}`}
            onClick={() => onSelect(t.key)}
          >
            <span className="ctab__name">{t.label}</span>
            <span className="ctab__count">{t.count} {unit}</span>
          </button>
        ))}
      </div>

      {edges.right && (
        <button className="cstrip__arrow cstrip__arrow--r" onClick={() => nudge(1)} aria-label="Scroll right">
          <ChevronRight size={16} />
        </button>
      )}

      <MastersStyles />
    </div>
  );
}

/* -------------------------------------------------------------------- Pager */
export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  // Only ever render a handful of numbers, whatever the page count.
  const window_ = [];
  const first = Math.max(0, Math.min(page - 2, pages - 5));
  for (let i = first; i < Math.min(pages, first + 5); i += 1) window_.push(i);

  return (
    <div className="table-pager mst-pager">
      <span className="mst-pager__count">
        Showing {from} to {to} of {total} records
      </span>
      <div className="mst-pager__btns">
        {window_.map((p) => (
          <button key={p} className={p === page ? 'on' : ''} onClick={() => onPage(p)}>
            {p + 1}
          </button>
        ))}
        <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
        <button disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}>Last</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Bulk actions */
export function SelectionBar({ count, onClear, children }) {
  if (count === 0) return null;
  return (
    <div className="selbar">
      <span className="selbar__n">{count} selected</span>
      <div className="selbar__actions">{children}</div>
      <button className="selbar__x" onClick={onClear} aria-label="Clear selection">
        <X size={15} />
      </button>
    </div>
  );
}

/** A dropdown of actions, closed by clicking anywhere else. */
export function ActionMenu({ label, items, disabled, align = 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="amenu">
      <button
        className="btn btn--ghost"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        {label} <ChevronRight size={13} className={`amenu__chev ${open ? 'on' : ''}`} />
      </button>
      {open && (
        <>
          <div className="amenu__scrim" onClick={() => setOpen(false)} />
          <div className={`amenu__pop amenu__pop--${align}`}>
            {items.map((it) => (
              <button
                key={it.label}
                className={`amenu__item ${it.danger ? 'danger' : ''}`}
                onClick={() => { setOpen(false); it.onClick(); }}
                disabled={it.disabled}
              >
                {it.icon}{it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function MastersStyles() {
  return (
    <style>{`
      /* --------------------------------------------------- category strip */
      .cstrip { position: relative; display: flex; align-items: stretch; }
      .cstrip__rail {
        display: flex; gap: 0; overflow-x: auto; scroll-behavior: smooth;
        background: #F2F7FD; border-radius: var(--radius-lg);
        scrollbar-width: none; flex: 1; min-width: 0;
      }
      .cstrip__rail::-webkit-scrollbar { display: none; }

      .ctab {
        flex: 0 0 auto; min-width: 168px;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 14px 22px; border: 2px solid transparent; border-radius: var(--radius-lg);
        background: none; cursor: pointer; white-space: nowrap;
      }
      .ctab__name { font-size: 14px; font-weight: 600; color: var(--color-text); }
      .ctab__count { font-size: 12.5px; color: var(--color-text-muted); }
      .ctab:hover { background: rgba(255,255,255,0.6); }
      .ctab.on {
        background: var(--color-surface);
        border-color: var(--color-info, #2563EB);
      }
      .ctab.on .ctab__name { color: var(--color-info, #2563EB); font-weight: 700; }

      .cstrip__arrow {
        position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
        width: 30px; height: 30px; border-radius: 50%;
        border: 1px solid var(--color-border); background: var(--color-surface);
        color: var(--color-text-muted); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(22,24,29,0.12);
      }
      .cstrip__arrow--l { left: -6px; }
      .cstrip__arrow--r { right: -6px; }
      .cstrip__arrow:hover { color: var(--color-text); }

      /* ----------------------------------------------------------- pager */
      .mst-pager { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .mst-pager__count { flex: 1; font-size: 13px; color: var(--color-text-muted); }
      .mst-pager__btns { display: flex; gap: 6px; }
      .mst-pager__btns button.on {
        background: var(--color-info, #2563EB); color: #fff;
        border-color: var(--color-info, #2563EB);
      }

      /* ------------------------------------------------------ selection */
      .selbar {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 14px; border-radius: var(--radius-md);
        background: var(--color-info-soft, #EAF1FE);
        border: 1px solid var(--color-info, #2563EB);
      }
      .selbar__n { font-size: 13px; font-weight: 700; color: var(--color-info, #2563EB); }
      .selbar__actions { flex: 1; display: flex; gap: 8px; flex-wrap: wrap; }
      .selbar__x {
        border: none; background: none; color: var(--color-info, #2563EB);
        display: flex; cursor: pointer;
      }

      /* ---------------------------------------------------- action menu */
      .amenu { position: relative; }
      .amenu__chev { transition: var(--transition-smooth); }
      .amenu__chev.on { transform: rotate(90deg); }
      .amenu__scrim { position: fixed; inset: 0; z-index: 40; }
      .amenu__pop {
        position: absolute; top: calc(100% + 6px); z-index: 41;
        min-width: 210px; padding: 6px;
        background: var(--color-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-md); box-shadow: var(--shadow-modal);
      }
      .amenu__pop--right { right: 0; }
      .amenu__pop--left { left: 0; }
      .amenu__item {
        display: flex; align-items: center; gap: 9px; width: 100%;
        padding: 9px 11px; border: none; background: none; border-radius: 8px;
        font: inherit; font-size: 13px; font-weight: 600; color: var(--color-text);
        text-align: left; cursor: pointer;
      }
      .amenu__item:hover:not(:disabled) { background: var(--color-canvas); }
      .amenu__item:disabled { opacity: 0.45; cursor: not-allowed; }
      .amenu__item.danger { color: var(--color-danger); }
      .amenu__item.danger:hover:not(:disabled) { background: var(--color-danger-soft); }

      /* ------------------------------------------------- grid edit cells */
      .gcell {
        height: 36px; width: 100%; box-sizing: border-box; padding: 0 10px;
        border: 1px solid var(--color-border); border-radius: var(--radius-md);
        background: var(--color-surface); font: inherit; font-size: 13px;
        color: var(--color-text); outline: none;
      }
      .gcell:focus { border-color: var(--color-info, #2563EB); }
      .gcell--dirty { border-color: var(--color-warning); background: #FFFDF7; }

      .gcheck {
        width: 17px; height: 17px; accent-color: var(--color-info, #2563EB);
        cursor: pointer;
      }

      .mst-top {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 16px; flex-wrap: wrap;
      }
      .mst-title { font-size: 20px; font-weight: 800; margin: 0; }
      .mst-actions { display: flex; gap: 8px; flex-wrap: wrap; }

      .mst-filters {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 14px; align-items: end;
      }
      .mst-filters__actions { display: flex; gap: 8px; }

      .mst-note {
        padding: 11px 14px; border-radius: var(--radius-md);
        font-size: 13px; font-weight: 600;
        background: var(--color-success-soft); color: var(--color-success);
      }
      .mst-note.bad { background: var(--color-danger-soft); color: var(--color-danger); }
      .mst-note.warn { background: var(--color-warning-soft); color: var(--color-warning); }
    `}</style>
  );
}
