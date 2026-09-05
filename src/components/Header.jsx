import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Plus, X, ArrowRight, ChevronDown, LogOut, Check, Store } from 'lucide-react';
import SearchSelect from './SearchSelect';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';
import { useAuth } from '../context/AuthContext';

const SHIFT_KEY = 'lumiere_shift_active';

/** Route → page title. Matches the nav label so the rail and the header agree. */
const TITLES = {
  '/dashboard': 'Dashboard',
  '/billing': 'Live Orders',
  '/payments': 'Payments',
  '/menu': 'Menu Catalog',
  '/inventory': 'Inventory',
  '/inventory/available-stock': 'Available Stock',
  '/inventory/closing-stock': 'Closing Stock',
  '/inventory/purchase': 'Purchase',
  '/inventory/wastage': 'Wastage',
  '/inventory/transfer': 'Transfer',
  '/inventory/vendors': 'Vendors',
  '/inventory/summary': 'Stock Summary',
  '/recipes': 'Recipes',
  '/reports': 'Reports',
  '/reports/item-wise': 'Item-wise Sales',
  '/reports/category-wise': 'Category-wise Sales',
  '/reports/payment-mode': 'Payment Mode Report',
  '/reports/day-wise': 'Day-wise Sales',
  '/reports/purchase': 'Purchase Report',
  '/orders': 'Order History',
  '/customers': 'Customers',
  '/qr-management': 'QR Codes',
  '/staff': 'Staff',
  '/branding': 'Branding',
  '/settings': 'Settings',
  '/admin': 'Platform Admin',
};

/**
 * Opening another restaurant on the same login.
 *
 * The slug is the tenant's public address (QR routing, subdomain), so it is
 * shown rather than silently derived — an owner who later wants a nice URL
 * should see what they are getting while they can still change it.
 */
function AddRestaurantModal({ onClose, onCreate, onSwitch }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const derive = (v) =>
    v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const effectiveSlug = touchedSlug ? derive(slug) : derive(name);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await onCreate(name, effectiveSlug);
    if (!res.success) {
      setSaving(false);
      setError(res.error || 'Could not create the restaurant.');
      return;
    }
    // Land the owner inside what they just made; this reloads the app.
    await onSwitch(res.id);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">Add restaurant</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="hdr-error">{error}</div>}

          <div className="field">
            <label>Restaurant name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Baba Foods Andheri"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Address (used in QR links)</label>
            <input
              value={touchedSlug ? slug : effectiveSlug}
              onChange={(e) => { setTouchedSlug(true); setSlug(e.target.value); }}
              placeholder="baba-foods-andheri"
            />
          </div>

          <div className="hdr-hint">
            This creates a separate restaurant with its own menu, staff and stock.
            You will be switched into it.
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create restaurant'}
          </button>
        </div>

        <style>{`
          .hdr-error {
            padding: 12px 14px; border-radius: var(--radius-md);
            background: var(--color-danger-soft); color: var(--color-danger);
            font-size: 13px; font-weight: 600;
          }
          .hdr-hint { font-size: 12.5px; color: var(--color-text-muted); }
        `}</style>
      </form>
    </div>
  );
}

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [shiftActive, setShiftActive] = useState(() => localStorage.getItem(SHIFT_KEY) !== 'ended');
  const [showShiftMenu, setShowShiftMenu] = useState(false);

  const [showOutletMenu, setShowOutletMenu] = useState(false);
  const { outlets, outlet, selectOutlet } = useOutlet();
  const { restaurants, switchRestaurant, createRestaurant, switching } = useAuth();
  const [showRestaurantMenu, setShowRestaurantMenu] = useState(false);
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);

  const activeRestaurant = restaurants.find((r) => r.is_active) || null;
  const [showAlerts, setShowAlerts] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [availableTables, setAvailableTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [customerData, setCustomerData] = useState({
    name: '',
    phone: '',
    guests: 2,
    tableId: '',
  });

  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    const options = { day: 'numeric', month: 'short' };
    setCurrentDate(new Date().toLocaleDateString('en-US', options));
  }, []);

  const handleEndShift = () => {
    if (!confirm('End shift? This will disable new orders until next shift is started.')) return;
    localStorage.setItem(SHIFT_KEY, 'ended');
    setShiftActive(false);
    setShowShiftMenu(false);
  };

  const handleStartShift = () => {
    localStorage.setItem(SHIFT_KEY, 'active');
    setShiftActive(true);
    setShowShiftMenu(false);
  };

  const getTitle = () => TITLES[location.pathname] || 'Spice OS';

  /**
   * Outlets come from OutletContext, which is also what every stock screen
   * reads. Switching here switches the branch the whole app is looking at.
   */
  const openOutletMenu = () => setShowOutletMenu((v) => !v);

  /** Anything on the floor that needs a manager's eyes right now. */
  const openAlerts = async () => {
    const next = !showAlerts;
    setShowAlerts(next);
    if (!next) return;
    setAlertsLoading(true);
    try {
      const { data: tables } = await supabase
        .from('restaurant_tables')
        .select('table_number, status, customer_sessions(started_at, session_status)')
        .order('table_number');

      const found = [];
      for (const t of tables || []) {
        if (t.status === 'billing') {
          found.push({ id: `bill-${t.table_number}`, tone: 'amber', text: `Table ${t.table_number} is waiting to settle` });
        }
        const active = (t.customer_sessions || []).find((x) => x.session_status === 'active');
        if (active?.started_at) {
          const mins = Math.floor((Date.now() - new Date(active.started_at).getTime()) / 60000);
          if (mins > 45) {
            found.push({ id: `stale-${t.table_number}`, tone: 'amber', text: `Table ${t.table_number} open ${mins} min` });
          }
        }
        if (t.status === 'cleaning') {
          found.push({ id: `clean-${t.table_number}`, tone: 'neutral', text: `Table ${t.table_number} needs clearing` });
        }
      }
      setAlerts(found);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleOpenModal = async () => {
    setShowModal(true);
    setLoadingTables(true);
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('status', 'available')
        .order('table_number');
      if (!error && data) {
        setAvailableTables(data);
        setCustomerData((prev) => ({ ...prev, tableId: data.length > 0 ? data[0].id : '' }));
      }
    } catch (err) {
      alert('Error loading available tables: ' + (err.message || err));
    } finally {
      setLoadingTables(false);
    }
  };

  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!customerData.tableId) {
      alert('Please select a table.');
      return;
    }
    try {
      const { data: session, error: sessionError } = await supabase
        .from('customer_sessions')
        .insert([{
          table_id: customerData.tableId,
          customer_name: customerData.name,
          phone_number: customerData.phone,
          guest_count: customerData.guests,
          session_status: 'active',
        }])
        .select()
        .single();

      if (sessionError) throw sessionError;

      const { error: tableError } = await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' })
        .eq('id', customerData.tableId);

      if (tableError) throw tableError;

      setShowModal(false);
      setCustomerData({ name: '', phone: '', guests: 2, tableId: '' });
      navigate(`/menu?sessionId=${session.id}&tableId=${session.table_id}`);
    } catch (error) {
      alert('Error starting session: ' + error.message);
    }
  };

  return (
    <header className="header">
      <h1 className="page-title">{getTitle()}</h1>

      <div className="search-field">
        <Search size={15} />
        <input type="text" placeholder="Search tables, items, or orders…" />
      </div>

      <div className="header-spacer" />

      {restaurants.length > 1 && (
        <div className="pop-wrapper">
          <button
            className="ghost-btn"
            onClick={() => setShowRestaurantMenu((v) => !v)}
            disabled={switching}
          >
            <Store size={14} />
            {switching ? 'Switching…' : (activeRestaurant?.name || 'Restaurant')}
            <ChevronDown size={13} className="chev" />
          </button>
          {showRestaurantMenu && (
            <>
              <div className="pop-backdrop" onClick={() => setShowRestaurantMenu(false)} />
              <div className="pop">
                <div className="pop__label">Your restaurants</div>
                {restaurants.map((r) => (
                  <button
                    key={r.id}
                    className="pop__item"
                    disabled={r.is_active}
                    onClick={() => { setShowRestaurantMenu(false); switchRestaurant(r.id); }}
                  >
                    <span>
                      {r.name}
                      {r.status !== 'active' && r.status !== 'trial' && (
                        <em className="pop__flag"> · {r.status}</em>
                      )}
                    </span>
                    {r.is_active && <Check size={14} />}
                  </button>
                ))}
                <button
                  className="pop__item pop__item--add"
                  onClick={() => { setShowRestaurantMenu(false); setShowAddRestaurant(true); }}
                >
                  <Plus size={14} /> <span>Add restaurant</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="pop-wrapper">
        <button className="ghost-btn" onClick={openOutletMenu}>
          {outlet?.name || 'Main Outlet'} <ChevronDown size={13} className="chev" />
        </button>
        {showOutletMenu && (
          <>
            <div className="pop-backdrop" onClick={() => setShowOutletMenu(false)} />
            <div className="pop pop--sm">
              <div className="pop__label">Outlet</div>
              {outlets.length === 0 && <div className="pop__empty">Main Outlet</div>}
              {outlets.map((o) => (
                <button
                  key={o.id}
                  className="pop__item"
                  onClick={() => { selectOutlet(o.id); setShowOutletMenu(false); }}
                >
                  <span>{o.name}</span>
                  {o.id === outlet?.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {showAddRestaurant && (
        <AddRestaurantModal
          onClose={() => setShowAddRestaurant(false)}
          onCreate={createRestaurant}
          onSwitch={switchRestaurant}
        />
      )}

      <div className="date-chip">{currentDate}</div>

      <div className="shift-wrapper">
        <button
          className={`shift-pill ${shiftActive ? 'is-active' : 'is-ended'}`}
          onClick={() => setShowShiftMenu(!showShiftMenu)}
        >
          <span className="shift-dot" />
          {shiftActive ? 'Shift active' : 'Shift ended'}
          <ChevronDown size={13} />
        </button>
        {showShiftMenu && (
          <div className="shift-menu">
            {shiftActive ? (
              <button className="shift-menu-item" onClick={handleEndShift}>
                <LogOut size={14} /> End shift
              </button>
            ) : (
              <button className="shift-menu-item" onClick={handleStartShift}>
                <LogOut size={14} /> Start new shift
              </button>
            )}
          </div>
        )}
      </div>

      <div className="pop-wrapper">
        <button className="icon-btn" title="Notifications" onClick={openAlerts}>
          <Bell size={17} />
          {alerts.length > 0 && <span className="icon-dot" />}
        </button>
        {showAlerts && (
          <>
            <div className="pop-backdrop" onClick={() => setShowAlerts(false)} />
            <div className="pop">
              <div className="pop__label">Needs attention</div>
              {alertsLoading && <div className="pop__empty">Checking the floor…</div>}
              {!alertsLoading && alerts.length === 0 && (
                <div className="pop__empty">All clear — nothing needs you.</div>
              )}
              {!alertsLoading && alerts.map((a) => (
                <button
                  key={a.id}
                  className="pop__item"
                  onClick={() => { setShowAlerts(false); navigate('/billing'); }}
                >
                  <span className={`pop__dot pop__dot--${a.tone}`} />
                  <span>{a.text}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {shiftActive && (
        <button className="primary-btn" onClick={handleOpenModal}>
          <Plus size={15} /> New Order
        </button>
      )}

      {showShiftMenu && <div className="shift-backdrop" onClick={() => setShowShiftMenu(false)} />}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">New order</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleStartSession} className="modal-body">
              <div className="field">
                <label>Table</label>
                {loadingTables ? (
                  <div className="field-note">Loading tables…</div>
                ) : availableTables.length === 0 ? (
                  <div className="field-note is-error">
                    No available tables. Complete or clean a table first.
                  </div>
                ) : (
                  <SearchSelect
                    value={customerData.tableId}
                    onChange={(v) => setCustomerData({ ...customerData, tableId: v })}
                    options={availableTables.map((t) => ({
                      value: t.id,
                      label: `Table ${t.table_number}`,
                      sub: `${t.capacity} seats`,
                    }))}
                    placeholder="Select a table…"
                    ariaLabel="Table"
                  />
                )}
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Customer name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar"
                    value={customerData.name}
                    onChange={(e) => setCustomerData({ ...customerData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input
                    type="tel"
                    placeholder="+91"
                    value={customerData.phone}
                    onChange={(e) => setCustomerData({ ...customerData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label>Guests</label>
                <div className="guest-picker">
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={customerData.guests === n ? 'on' : ''}
                      onClick={() => setCustomerData({ ...customerData, guests: n })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={!customerData.tableId}>
                  Start order <ArrowRight size={15} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          height: 64px;
          padding: 0 32px;
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          flex-shrink: 0;
          z-index: 5;
          box-sizing: border-box;
        }

        .page-title {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--color-text);
          white-space: nowrap;
        }

        .header-spacer { flex: 1; }

        .search-field {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 14px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-faint);
          width: 300px;
          box-sizing: border-box;
        }

        .search-field input {
          border: none;
          background: transparent;
          outline: none;
          width: 100%;
          font-size: 13px;
          color: var(--color-text);
        }

        .search-field input::placeholder { color: var(--color-text-faint); }

        .ghost-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 14px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          white-space: nowrap;
        }

        .ghost-btn:hover { background: var(--color-canvas); }
        .ghost-btn .chev { color: var(--color-text-muted); }

        .date-chip {
          display: flex;
          align-items: center;
          height: 40px;
          padding: 0 14px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          white-space: nowrap;
          box-sizing: border-box;
        }

        .shift-wrapper { position: relative; }

        .shift-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 14px;
          border-radius: var(--radius-sm);
          border: none;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .shift-pill.is-active { background: var(--color-success-soft); color: var(--color-success); }
        .shift-pill.is-ended { background: var(--color-danger-soft); color: var(--color-danger); }

        .shift-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
        }

        .shift-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 180px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: 0 12px 32px rgba(22, 24, 29, 0.12);
          padding: 6px;
          z-index: 20;
        }

        .shift-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          border: none;
          background: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          text-align: left;
        }

        .shift-menu-item:hover { background: var(--color-canvas); }

        .shift-backdrop { position: fixed; inset: 0; z-index: 15; }

        /* ---- Popovers ---- */
        .pop-wrapper { position: relative; }
        .pop-backdrop { position: fixed; inset: 0; z-index: 15; }

        .pop {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 260px;
          max-width: 320px;
          max-height: 340px;
          overflow-y: auto;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: 0 12px 32px rgba(22, 24, 29, 0.12);
          padding: 6px;
          z-index: 20;
        }

        .pop--sm { min-width: 200px; }

        .pop__item:disabled { opacity: 1; cursor: default; }
        .pop__item--add {
          margin-top: 4px;
          padding-top: 12px;
          border-top: 1px solid var(--color-border);
          border-radius: 0 0 8px 8px;
          color: var(--color-primary);
        }
        .pop__flag { font-style: normal; color: var(--color-text-muted); font-weight: 500; }

        .pop__label {
          padding: 8px 12px 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--color-text-muted);
        }

        .pop__item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          border: none;
          background: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          text-align: left;
          text-decoration: none;
        }

        .pop__item:hover { background: var(--color-canvas); }
        .pop__item span:not(.pop__dot) { flex: 1; min-width: 0; }

        .pop__dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          background: var(--color-text-faint);
        }

        .pop__dot--amber { background: var(--color-warning); }
        .pop__dot--neutral { background: var(--color-text-faint); }

        .pop__empty {
          padding: 10px 12px 14px;
          font-size: 13px;
          color: var(--color-text-muted);
        }

        .pop__note {
          padding: 10px 12px 6px;
          margin-top: 4px;
          border-top: 1px solid var(--color-border-soft);
          font-size: 12px;
          color: var(--color-text-faint);
        }

        .icon-btn {
          position: relative;
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-btn:hover { background: var(--color-canvas); }

        .icon-dot {
          position: absolute;
          top: 8px;
          right: 9px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--color-danger);
          border: 1.5px solid var(--color-surface);
        }

        .primary-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 18px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--color-primary);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }

        .primary-btn:hover:not(:disabled) { background: var(--color-primary-hover); }
        .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ---- New order modal ---- */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(22, 24, 29, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-card {
          width: 440px;
          max-width: calc(100vw - 32px);
          background: var(--color-surface);
          border-radius: var(--radius-lg);
          padding: 28px;
          box-sizing: border-box;
          box-shadow: var(--shadow-modal);
        }

        .modal-head {
          display: flex;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-title { flex: 1; font-size: 18px; font-weight: 800; color: var(--color-text); }

        .modal-close {
          border: none;
          background: none;
          color: var(--color-text-muted);
          display: flex;
        }

        .modal-body { display: flex; flex-direction: column; gap: 14px; }

        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .field label {
          display: block;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--color-text);
          margin-bottom: 6px;
        }

        .field input,
        .field select {
          width: 100%;
          height: 40px;
          padding: 0 14px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          color: var(--color-text);
          background: var(--color-surface);
          outline: none;
          box-sizing: border-box;
        }

        .field input:focus,
        .field select:focus { border-color: var(--color-border-strong); }
        .field input::placeholder { color: var(--color-text-faint); }

        .field-note { font-size: 13px; color: var(--color-text-muted); }
        .field-note.is-error { color: var(--color-danger); font-weight: 600; }

        .guest-picker { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }

        .guest-picker button {
          height: 40px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-surface);
          font-size: 13.5px;
          font-weight: 600;
          color: var(--color-text-soft);
        }

        .guest-picker button.on {
          background: var(--color-text);
          border-color: var(--color-text);
          color: #fff;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          padding-top: 8px;
        }
      `}</style>
    </header>
  );
};

export default Header;
