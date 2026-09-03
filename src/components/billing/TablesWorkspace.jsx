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

const KIND_LABEL = { packing: 'Packing', car: 'Car bay' };

function TableCard({ table, isSelected, onClick, onFreeTable }) {
  const session = table.active_session;
  const isCounter = table.kind === 'packing' || table.kind === 'car';
  const raw = String(table.table_number ?? '');
  const label = /^[A-Za-z]/.test(raw) ? raw : `T${raw}`;
  const s = STATUS[table.status] || STATUS.available;
  const min = session ? minutesSince(session.started_at) : null;
  const late = min !== null && min > STALE_MINUTES;

  return (
    <div
      className={`tw-card ${isSelected ? 'is-selected' : ''} ${isCounter ? 'is-counter' : ''}`}
      onClick={() => onClick(table)}
    >
      <div className="tw-strip" style={{ background: s.strip }} />
      <div className="tw-body">
        <div className="tw-top">
          {/* Where the label already carries its area (G1, B7, P2) it is shown
              as-is — "TG1" would read as a typo. A plain number still gets the
              familiar T, so restaurants that never adopted prefixes are
              unchanged. */}
          <div className="tw-id">{label}</div>
          <div
            className="tw-min tnum"
            style={{ color: late ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
          >
            {/* A parcel counter and a car bay seat nobody, so the pax line is
                meaningless for them — show what they are instead. */}
            {min !== null
              ? `${min} min`
              : (isCounter ? KIND_LABEL[table.kind] : `${table.capacity} pax`)}
          </div>
        </div>

        <div className="tw-guest">
          {session
            ? (session.customer_name || 'Walk-in guest')
            : (isCounter ? 'Free' : 'Vacant')}
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

  // Grouped by area, following the section order rather than alphabetically —
  // Ground before Basement is how the building is laid out.
  const groupedTables = React.useMemo(() => {
    const order = new Map(sections.map((sec, i) => [sec.id, i]));
    const byId = new Map();

    tables.forEach((t) => {
      const key = t.section_id || 'none';
      if (!byId.has(key)) {
        byId.set(key, {
          id: key,
          name: sections.find((sec) => sec.id === t.section_id)?.section_name || 'Unassigned',
          rank: order.has(t.section_id) ? order.get(t.section_id) : 999,
          tables: [],
          busy: 0,
        });
      }
      const g = byId.get(key);
      g.tables.push(t);
      if (t.active_session) g.busy += 1;
    });

    // "G10" sorts before "G2" alphabetically, which is not how anybody reads a
    // floor. Split the label into its letters and its number and compare each.
    const natural = (a, b) => {
      const parse = (v) => {
        const m = String(v.table_number || '').match(/^([A-Za-z]*)(\d*)/);
        return [m?.[1] || '', Number(m?.[2] || 0)];
      };
      const [pa, na] = parse(a);
      const [pb, nb] = parse(b);
      return pa === pb ? na - nb : pa.localeCompare(pb);
    };

    byId.forEach((g) => g.tables.sort(natural));
    return [...byId.values()].sort((a, b) => a.rank - b.rank);
  }, [tables, sections]);

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
        <div className="tw-areas">
          {/* One row per area rather than a single flat grid: a floor plan is
              read by where things are, and thirty-five cards in one wrap tells
              nobody which floor they are standing on. */}
          {groupedTables.map((group) => (
            <div key={group.id} className="tw-area">
              <div className="tw-area__head">
                <span className="tw-area__name">{group.name}</span>
                <span className="tw-area__count">
                  {group.tables.length}
                  {group.tables.some((t) => t.kind === 'packing') ? ' counters'
                    : group.tables.some((t) => t.kind === 'car') ? ' bays'
                      : ' tables'}
                  {group.busy > 0 && <em> · {group.busy} in use</em>}
                </span>
              </div>
              <div className="tw-grid">
                {group.tables.map((t) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    isSelected={selectedSessionId && sessionTableId === t.id}
                    onClick={onTableClick}
                    onFreeTable={onFreeTable}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .tw { display: flex; flex-direction: column; gap: 14px; }
        .tw-areas { display: flex; flex-direction: column; gap: 18px; }
        .tw-area__head {
          display: flex; align-items: baseline; gap: 10px;
          margin-bottom: 8px; padding-bottom: 6px;
          border-bottom: 1px solid var(--color-border-soft);
        }
        .tw-area__name { font-size: 13.5px; font-weight: 700; }
        .tw-area__count { font-size: 12px; color: var(--color-text-muted); }
        .tw-area__count em { font-style: normal; color: var(--color-info, #2563EB); }

        .tw-card.is-counter { background: #FCFBF8; }
        .tw-card.is-counter .tw-id { color: var(--color-text-soft); }

        .tw-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }
      `}</style>
    </div>
  );
}
