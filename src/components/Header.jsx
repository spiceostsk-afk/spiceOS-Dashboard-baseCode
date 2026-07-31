import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Plus, X, ArrowRight, HelpCircle, ChevronDown, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const SHIFT_KEY = 'lumiere_shift_active';

/** Route → page title. Matches the nav label so the rail and the header agree. */
const TITLES = {
  '/dashboard': 'Dashboard',
  '/billing': 'Live Orders',
  '/payments': 'Payments',
  '/menu': 'Menu Catalog',
  '/inventory': 'Inventory',
  '/reports': 'Reports',
  '/orders': 'Order History',
  '/customers': 'Customers',
  '/qr-management': 'QR Codes',
  '/staff': 'Staff',
  '/branding': 'Branding',
  '/settings': 'Settings',
  '/admin': 'Platform Admin',
};

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [shiftActive, setShiftActive] = useState(() => localStorage.getItem(SHIFT_KEY) !== 'ended');
  const [showShiftMenu, setShowShiftMenu] = useState(false);

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

      <button className="ghost-btn">
        Main Outlet <ChevronDown size={13} className="chev" />
      </button>

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

      <button className="icon-btn" title="Notifications">
        <Bell size={17} />
        <span className="icon-dot" />
      </button>

      <button className="icon-btn" title="Support Agent">
        <HelpCircle size={17} />
      </button>

      <button
        className="icon-btn"
        onClick={signOut}
        title={user?.email ? `Sign out (${user.email})` : 'Sign out'}
      >
        <LogOut size={17} />
      </button>

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
                  <select
                    value={customerData.tableId}
                    onChange={(e) => setCustomerData({ ...customerData, tableId: e.target.value })}
                    required
                  >
                    {availableTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.table_number} ({t.capacity} seats)
                      </option>
                    ))}
                  </select>
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
