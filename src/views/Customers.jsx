import React, { useState } from 'react';
import { Users, RefreshCw, Search, X } from 'lucide-react';
import { useCustomersData } from '../hooks/useCustomersData';
import { fmtDate } from '../lib/dates';

const REGULAR_VISITS = 5;

const initialsOf = (name) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();


function CustomerDrawer({ customer, formatCurrency, onClose }) {
  if (!customer) return null;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <div className="cust-drawer__head">
          <span className="cust-avatar cust-avatar--lg">{initialsOf(customer.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cust-drawer__name">{customer.name}</div>
            <div className="card__subtitle">
              {customer.phone || 'No phone'} · {customer.visitCount} visit{customer.visitCount === 1 ? '' : 's'}
            </div>
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="drawer__section">
          <div className="drawer__label">Summary</div>
          <div className="cust-summary">
            <div>
              <div className="card__subtitle">Lifetime spend</div>
              <div className="cust-summary__value tnum">{formatCurrency(customer.totalSpent)}</div>
            </div>
            <div>
              <div className="card__subtitle">Last visit</div>
              <div className="cust-summary__value">{fmtDate(customer.lastVisit)}</div>
            </div>
          </div>
        </div>

        <div className="drawer__section">
          <div className="drawer__label">Visit history ({customer.sessions.length})</div>
          {customer.sessions.slice(0, 20).map((s) => (
            <div key={s.id} className="cust-visit">
              <span className="muted">{fmtDate(s.ended_at)}</span>
              <span className="cust-visit__what">
                {s.guest_count || '—'} guests · {s.session_status}
              </span>
              <span className="cust-visit__amt tnum">{formatCurrency(s.total_amount)}</span>
            </div>
          ))}
        </div>

        <style>{`
          .cust-drawer__head {
            display: flex;
            align-items: center;
            gap: 14px;
            padding-bottom: 18px;
            border-bottom: 1px solid var(--color-border);
          }
          .cust-drawer__name { font-size: 17px; font-weight: 800; }
          .cust-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .cust-summary__value { font-size: 17px; font-weight: 800; margin-top: 2px; }
          .cust-visit {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 9px 0;
            border-bottom: 1px solid var(--color-border-soft);
            font-size: 13px;
          }
          .cust-visit:last-child { border-bottom: none; }
          .cust-visit .muted { color: var(--color-text-muted); width: 60px; flex-shrink: 0; }
          .cust-visit__what { flex: 1; min-width: 0; }
          .cust-visit__amt { font-weight: 700; }
        `}</style>
      </div>
    </>
  );
}

export default function Customers() {
  const {
    customers, loading, error, selectedCustomer, setSelectedCustomer, refetch, formatCurrency,
  } = useCustomersData();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('all');

  const byTag = customers.filter((c) => {
    if (tag === 'regular') return c.visitCount >= REGULAR_VISITS;
    if (tag === 'new') return c.visitCount < REGULAR_VISITS;
    return true;
  });

  const filtered = search
    ? byTag.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.phone && c.phone.includes(search)),
      )
    : byTag;

  if (error && customers.length === 0) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">Couldn’t load customers</div>
            <div className="empty-state__sub">{error}</div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={refetch}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  // "New" here matches the row tag, so the metric and the table always agree.
  const newCustomers = customers.filter((c) => c.visitCount < REGULAR_VISITS).length;
  const returning = customers.filter((c) => c.visitCount > 1).length;
  const repeatRate = customers.length
    ? Math.round((returning / customers.length) * 100)
    : 0;

  const metrics = [
    { label: 'Total customers', value: customers.length },
    { label: 'New customers', value: newCustomers },
    { label: 'Repeat rate', value: `${repeatRate}%` },
  ];

  return (
    <div className="page">
      <div className="metric-grid metric-grid--3">
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-card__label">{m.label}</div>
            <div className="metric-card__value">{loading && customers.length === 0 ? '—' : m.value}</div>
          </div>
        ))}
      </div>

      <div className="cust-filters">
        <div className="search-input" style={{ width: 300 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="chip-row">
          <button className={`chip ${tag === 'all' ? 'on' : ''}`} onClick={() => setTag('all')}>All</button>
          <button className={`chip ${tag === 'regular' ? 'on' : ''}`} onClick={() => setTag('regular')}>
            Regulars ({REGULAR_VISITS}+ visits)
          </button>
          <button className={`chip ${tag === 'new' ? 'on' : ''}`} onClick={() => setTag('new')}>New</button>
        </div>
        <div className="spacer" />
        <button className="btn btn--ghost" onClick={refetch} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="cu-name">Customer</div>
          <div className="cu-phone">Phone</div>
          <div className="cu-visits">Visits</div>
          <div className="cu-last">Last visit</div>
          <div className="cu-spend">Lifetime spend</div>
          <div className="cu-tag">Tag</div>
        </div>

        {loading && customers.length === 0 && (
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading customers…</div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Users size={22} /></span>
            <div className="empty-state__title">No customers found</div>
            <div className="empty-state__sub">Customers appear here after their first visit.</div>
          </div>
        )}

        {filtered.map((c, i) => {
          const regular = c.visitCount >= REGULAR_VISITS;
          return (
            <div
              key={c.phone || i}
              className="table-row table-row--clickable"
              onClick={() => setSelectedCustomer(c)}
            >
              <div className="cu-name">
                <span className="cust-avatar">{initialsOf(c.name)}</span>
                <span className="strong">{c.name}</span>
              </div>
              <div className="cu-phone muted tnum">{c.phone || '—'}</div>
              <div className="cu-visits strong tnum">{c.visitCount}</div>
              <div className="cu-last muted">{fmtDate(c.lastVisit)}</div>
              <div className="cu-spend amount">{formatCurrency(c.totalSpent)}</div>
              <div className="cu-tag">
                <span className={`pill ${regular ? 'tone-green' : 'tone-blue'}`}>
                  {regular ? 'Regular' : 'New'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          formatCurrency={formatCurrency}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      <style>{`
        .cust-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

        .cu-name { flex: 1.4; min-width: 0; display: flex; align-items: center; gap: 10px; }
        .cu-phone { width: 130px; }
        .cu-visits { width: 60px; text-align: right; }
        .cu-last { width: 100px; }
        .cu-spend { width: 120px; text-align: right; }
        .cu-tag { width: 90px; padding-left: 20px; }

        .cust-avatar {
          width: 30px;
          height: 30px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--color-well);
          color: var(--color-text-soft);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
        }
        .cust-avatar--lg { width: 46px; height: 46px; font-size: 15px; }
      `}</style>
    </div>
  );
}
