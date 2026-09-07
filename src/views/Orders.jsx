import React, { useState } from 'react';
import {
  ClipboardList, Search, RefreshCw, Printer, ShieldCheck, Pencil, Ban, Trash2,
} from 'lucide-react';
import { useOrdersData } from '../hooks/useOrdersData';
import { useOrderAdmin } from '../hooks/useOrderAdmin';
import { EditOrderModal, VoidOrderModal, DeleteOrderModal } from './OrderAdminModals';

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All time' },
];

const STATUS_TONES = { completed: 'tone-green', void: 'tone-red' };

const time = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';

/** Flatten a session's orders into one KOT-by-KOT timeline. */
function buildTimeline(order) {
  const events = [];
  if (order.startedAt) events.push({ time: time(order.startedAt), event: 'Table opened' });

  (order.orders || [])
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .forEach((o, i) => {
      events.push({
        time: time(o.created_at),
        event: `KOT #${i + 1} sent · ${(o.order_items || []).length} item${(o.order_items || []).length === 1 ? '' : 's'}`,
      });
      if (o.order_status && o.order_status !== 'pending') {
        events.push({ time: time(o.created_at), event: `KOT #${i + 1} ${o.order_status}` });
      }
    });

  if (order.endedAt) {
    events.push({
      time: time(order.endedAt),
      event: order.status === 'void' ? 'Bill voided' : 'Bill settled',
    });
  }
  return events;
}

function ExpandedRow({ order, formatCurrency, onPrintKot, admin, onAdminAction }) {
  const items = (order.orders || []).flatMap((o) =>
    (o.order_items || []).map((oi) => ({
      name: oi.menu_items?.item_name || 'Unknown item',
      qty: oi.quantity,
      amount: oi.total_price || oi.item_price * oi.quantity || 0,
    })),
  );

  const timeline = buildTimeline(order);

  return (
    <div className="oh-expand">
      <div>
        <div className="drawer__label">Items</div>
        {items.length === 0 ? (
          <div className="card__subtitle">No items on this bill.</div>
        ) : (
          items.map((it, i) => (
            <div key={i} className="oh-expand__row">
              <span>{it.name} <span className="muted">×{it.qty}</span></span>
              <span className="tnum" style={{ fontWeight: 600 }}>{formatCurrency(it.amount)}</span>
            </div>
          ))
        )}

        <div className="oh-expand__meta">
          <span className="muted">
            {order.customerName} · {order.guests || '—'} guests · opened {dateTime(order.startedAt)}
          </span>
        </div>

        <button className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} onClick={() => onPrintKot(order)}>
          <Printer size={13} /> Reprint KOT
        </button>

        {/* Correcting a settled bill is owner-only. The buttons are hidden for
            everyone else as a courtesy; the database is what actually refuses
            a non-owner, because anyone can call an RPC. */}
        {admin.canAdminister && (order.orders || []).length > 0 && (
          <div className="oh-admin">
            <div className="oh-admin__label">
              <ShieldCheck size={13} /> Owner actions
            </div>
            {(order.orders || []).map((o, i) => (
              <div key={o.id} className="oh-admin__row">
                <span className="oh-admin__which">
                  {(order.orders || []).length > 1 ? `Order ${i + 1} · ` : ''}
                  {formatCurrency(o.total)}
                  {o.order_status === 'cancelled' && <em> · already voided</em>}
                </span>
                <span className="oh-admin__acts">
                  <button
                    className="btn btn--ghost btn--sm"
                    disabled={admin.busy || o.order_status === 'cancelled'}
                    onClick={() => onAdminAction('edit', order, o)}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    disabled={admin.busy || o.order_status === 'cancelled'}
                    onClick={() => onAdminAction('void', order, o)}
                  >
                    <Ban size={13} /> Void
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    disabled={admin.busy}
                    onClick={() => onAdminAction('delete', order, o)}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="drawer__label">KOT timeline</div>
        {timeline.map((t, i) => (
          <div key={i} className="oh-expand__tl">
            <span className="oh-expand__time tnum">{t.time}</span>
            <span>{t.event}</span>
          </div>
        ))}
      </div>

      <style>{`
        .oh-admin {
          margin-top: 16px; padding-top: 12px;
          border-top: 1px dashed var(--color-border-strong);
          display: flex; flex-direction: column; gap: 8px;
        }
        .oh-admin__label {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--color-text-muted);
        }
        .oh-admin__row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
        }
        .oh-admin__which { font-size: 12.5px; font-weight: 600; }
        .oh-admin__which em { font-style: normal; color: var(--color-danger); font-weight: 500; }
        .oh-admin__acts { display: flex; gap: 6px; }

        .oh-expand {
          padding: 16px 20px;
          margin: 8px 0 12px 0;
          background: var(--color-canvas);
          border-radius: var(--radius-md);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .oh-expand__row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 5px 0;
          font-size: 13px;
        }
        .oh-expand__row .muted { color: var(--color-text-muted); }
        .oh-expand__meta { margin-top: 10px; font-size: 12.5px; }
        .oh-expand__meta .muted { color: var(--color-text-muted); }
        .oh-expand__tl {
          display: flex;
          gap: 10px;
          align-items: baseline;
          padding: 5px 0;
          font-size: 13px;
        }
        .oh-expand__time { width: 62px; color: var(--color-text-muted); flex-shrink: 0; }

        @media (max-width: 900px) {
          .oh-expand { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

export default function Orders() {
  const {
    orders, loading, error, search, setSearch,
    statusFilter, setStatusFilter, dateRange, setDateRange,
    selectedOrder, setSelectedOrder, refetch, formatCurrency,
    STATUS_FILTERS, handlePrintKot,
  } = useOrdersData();

  const admin = useOrderAdmin(refetch);
  // { kind, session, order } — which bill is being corrected, and how.
  const [adminTarget, setAdminTarget] = useState(null);
  const [notice, setNotice] = useState(null);

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 5000);
  };

  const openAdmin = (kind, session, order) => setAdminTarget({
    kind,
    id: order.id,
    billNo: `#${session.billId}`,
    amount: Number(order.total) || 0,
    subtotal: Number(order.subtotal) || 0,
    items: (order.order_items || []).length,
    lines: (order.order_items || []).map((oi) => ({
      menuItemId: oi.menu_items ? oi.menu_item_id : '',
      qty: oi.quantity,
      price: oi.item_price,
    })),
  });

  if (error && orders.length === 0) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__title">Couldn’t load order history</div>
            <div className="empty-state__sub">{error}</div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={refetch}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {notice && (
        <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>
      )}

      <div className="oh-filters">
        <div className="search-input" style={{ width: 300 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Bill ID, table, customer, item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="chip-row">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              className={`chip ${statusFilter === f ? 'on' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="spacer" />

        <div className="segmented">
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              className={dateRange === r.key ? 'on' : ''}
              onClick={() => setDateRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button className="btn btn--ghost" onClick={refetch} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="oh-bill">Bill no.</div>
          <div className="oh-dt">Date &amp; time</div>
          <div className="oh-table">Table</div>
          <div className="oh-cust">Customer</div>
          <div className="oh-items">Items</div>
          <div className="oh-amt">Amount</div>
          <div className="oh-status">Status</div>
          <div className="oh-chev" />
        </div>

        {loading && orders.length === 0 && (
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading order history…</div>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><ClipboardList size={22} /></span>
            <div className="empty-state__title">No orders found</div>
            <div className="empty-state__sub">No completed or void orders match your filters.</div>
          </div>
        )}

        {orders.map((o) => {
          const expanded = selectedOrder?.id === o.id;
          return (
            <div key={o.id}>
              <div
                className="table-row table-row--clickable"
                onClick={() => setSelectedOrder(expanded ? null : o)}
              >
                <div className="oh-bill strong">#{o.billId}</div>
                <div className="oh-dt muted">{dateTime(o.endedAt)}</div>
                <div className="oh-table">T-{o.tableNumber}</div>
                <div className="oh-cust muted">{o.customerName}</div>
                <div className="oh-items muted tnum">{o.itemCount}</div>
                <div className="oh-amt amount">{formatCurrency(o.totalAmount)}</div>
                <div className="oh-status">
                  <span className={`pill ${STATUS_TONES[o.status] || 'tone-neutral'}`}>{o.status}</span>
                </div>
                <div className="oh-chev">{expanded ? '▾' : '▸'}</div>
              </div>

              {expanded && (
                <ExpandedRow
                  order={o}
                  formatCurrency={formatCurrency}
                  onPrintKot={handlePrintKot}
                  admin={admin}
                  onAdminAction={openAdmin}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* The correction dialogs. openAdmin only ever set the target — nothing
          rendered them, so Edit, Void and Delete looked live and did nothing. */}
      {adminTarget?.kind === 'edit' && (
        <EditOrderModal
          order={adminTarget}
          busy={admin.busy}
          onClose={() => setAdminTarget(null)}
          onConfirm={async (id, lines, reason) => {
            const res = await admin.editOrder(id, lines, reason);
            flash(res.success
              ? `${adminTarget.billNo} corrected. Its ingredients were adjusted to match.`
              : res.error, res.success ? 'ok' : 'bad');
            return res;
          }}
        />
      )}

      {adminTarget?.kind === 'void' && (
        <VoidOrderModal
          order={adminTarget}
          busy={admin.busy}
          onClose={() => setAdminTarget(null)}
          onConfirm={async (id, reason) => {
            const res = await admin.voidOrder(id, reason);
            flash(res.success
              ? `${adminTarget.billNo} voided. It stays on record and its stock has been returned.`
              : res.error, res.success ? 'ok' : 'bad');
            return res;
          }}
        />
      )}

      {adminTarget?.kind === 'delete' && (
        <DeleteOrderModal
          order={adminTarget}
          busy={admin.busy}
          onClose={() => setAdminTarget(null)}
          onConfirm={async (id, reason) => {
            const res = await admin.deleteOrder(id, reason);
            flash(res.success
              ? `${adminTarget.billNo} deleted. The audit entry records who removed it.`
              : res.error, res.success ? 'ok' : 'bad');
            return res;
          }}
        />
      )}

      <style>{`
        .oh-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

        .oh-bill { width: 90px; }
        .oh-dt { width: 130px; font-size: 12.5px; }
        .oh-table { width: 70px; }
        .oh-cust { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .oh-items { width: 60px; text-align: right; }
        .oh-amt { width: 100px; text-align: right; }
        .oh-status { width: 100px; }
        .oh-chev { width: 24px; text-align: center; color: var(--color-text-faint); }
      `}</style>
    </div>
  );
}
