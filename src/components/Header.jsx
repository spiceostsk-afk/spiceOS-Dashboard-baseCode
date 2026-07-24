import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Plus, X, User, Phone, Users, ArrowRight, HelpCircle, Calendar, ChevronDown, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const SHIFT_KEY = 'lumiere_shift_active';

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
    tableId: ''
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

  const getTitle = () => {
    switch(location.pathname) {
      case '/dashboard': return 'POS Dashboard';
      case '/menu': return 'Menu Catalog';
      case '/billing': {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab === 'online') return 'Online Orders Activity';
        if (tab === 'actions') return 'Store Status & Actions';
        return 'Live Billing Operations';
      }
      case '/payments': return 'Payment History';
      case '/reports': return 'Business Analytics';
      case '/settings': return 'Restaurant Settings';
      case '/customers': return 'Customer Management';
      case '/qr-management': return 'QR Code Management';
      case '/staff': return 'Staff Management';
      case '/orders': return 'Order History';
      default: return 'Spice OS';
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
        if (data.length > 0) {
          setCustomerData(prev => ({ ...prev, tableId: data[0].id }));
        } else {
          setCustomerData(prev => ({ ...prev, tableId: '' }));
        }
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
      // 1. Create Customer Session
      const { data: session, error: sessionError } = await supabase
        .from('customer_sessions')
        .insert([{
          table_id: customerData.tableId,
          customer_name: customerData.name,
          phone_number: customerData.phone,
          guest_count: customerData.guests,
          session_status: 'active'
        }])
        .select()
        .single();

      if (sessionError) throw sessionError;

      // 2. Update Table Status
      const { error: tableError } = await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' })
        .eq('id', customerData.tableId);

      if (tableError) throw tableError;

      // 3. Navigate to Menu
      setShowModal(false);
      // Reset form
      setCustomerData({
        name: '',
        phone: '',
        guests: 2,
        tableId: ''
      });
      navigate(`/menu?sessionId=${session.id}&tableId=${session.table_id}`);
    } catch (error) {
      alert('Error starting session: ' + error.message);
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <h2 className="main-title">{getTitle()}</h2>
        
        {/* Search Bar styled like Petpooja */}
        <div className="search-bar">
          <Search size={16} color="#8A8A8A" />
          <input type="text" placeholder="Search tables, items, or orders..." />
        </div>
      </div>

      <div className="header-right">
        {/* Outlet Dropdown mimicking Petpooja's header */}
        <div className="outlet-selector">
          <span>Main Outlet</span>
          <ChevronDown size={14} />
        </div>

        {/* Date Display */}
        <div className="date-display">
          <Calendar size={15} />
          <span>{currentDate}</span>
        </div>

        {/* New Order Trigger */}
        {shiftActive && (
          <button className="new-order-btn" onClick={handleOpenModal}>
            <Plus size={16} />
            <span>New Order</span>
          </button>
        )}

        <div className="shift-badge-wrapper">
          <div className={`shift-badge ${shiftActive ? 'active' : 'ended'}`} onClick={() => setShowShiftMenu(!showShiftMenu)}>
            <div className={`status-dot ${shiftActive ? 'dot-active' : 'dot-ended'}`}></div>
            <span>{shiftActive ? 'Shift Active' : 'Shift Ended'}</span>
            <ChevronDown size={12} />
          </div>
          {showShiftMenu && (
            <div className="shift-menu">
              {shiftActive ? (
                <button className="shift-menu-item" onClick={handleEndShift}><LogOut size={14} /> End Shift</button>
              ) : (
                <button className="shift-menu-item" onClick={handleStartShift}><LogOut size={14} /> Start New Shift</button>
              )}
            </div>
          )}
        </div>
        <button className="icon-btn">
          <Bell size={18} />
        </button>

        <button className="icon-btn font-support">
          <HelpCircle size={18} />
          <span className="tooltip-support">Support Agent</span>
        </button>

        <button
          className="icon-btn"
          onClick={signOut}
          title={user?.email ? `Sign out (${user.email})` : 'Sign out'}
        >
          <LogOut size={18} />
        </button>
      </div>

      {showShiftMenu && <div className="shift-backdrop" onClick={() => setShowShiftMenu(false)} />}

      {/* New Order Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Assign Table - New Order</h2>
              <button className="close-modal" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleStartSession} className="modal-form">
              <div className="form-group">
                <label>Select Table</label>
                {loadingTables ? (
                  <p style={{ fontSize: '0.9rem', color: '#888' }}>Loading tables...</p>
                ) : availableTables.length === 0 ? (
                  <p style={{ color: '#d9534f', fontSize: '0.9rem', fontWeight: 600 }}>No available tables. Complete or clean a table first.</p>
                ) : (
                  <select 
                    value={customerData.tableId}
                    onChange={(e) => setCustomerData({...customerData, tableId: e.target.value})}
                    required
                  >
                    {availableTables.map(t => (
                      <option key={t.id} value={t.id}>
                        Table {t.table_number} ({t.capacity} Seats)
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label><User size={16} /> Customer Name</label>
                <input 
                  type="text" 
                  placeholder="Enter name..." 
                  value={customerData.name}
                  onChange={(e) => setCustomerData({...customerData, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label><Phone size={16} /> Phone Number</label>
                <input 
                  type="tel" 
                  placeholder="Enter phone..." 
                  value={customerData.phone}
                  onChange={(e) => setCustomerData({...customerData, phone: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label><Users size={16} /> Guest Count</label>
                <div className="guest-selector">
                  {[1, 2, 3, 4, 5, 6, 8].map(n => (
                    <button 
                      type="button"
                      key={n} 
                      className={customerData.guests === n ? 'active' : ''}
                      onClick={() => setCustomerData({...customerData, guests: n})}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="start-btn" disabled={!customerData.tableId}>
                  Assign Table & Start Order <ArrowRight size={18} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .header {
          height: 70px;
          padding: 0 2rem;
          background: white;
          border-bottom: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 10;
          flex-shrink: 0;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex: 1;
        }

        .main-title {
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--color-primary);
          white-space: nowrap;
        }

        .search-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          padding: 0.55rem 1rem;
          border-radius: 10px;
          width: 100%;
          max-width: 320px;
        }

        .search-bar input {
          border: none;
          background: transparent;
          outline: none;
          width: 100%;
          font-size: 0.85rem;
          color: var(--color-primary);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .outlet-selector {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--color-primary);
          cursor: pointer;
        }

        .date-display {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: var(--color-accent-soft);
          border: 1px solid var(--color-border);
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--color-primary);
        }

        .new-order-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: var(--color-accent);
          color: var(--color-primary);
          padding: 0.55rem 1.1rem;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.85rem;
          border: none;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .new-order-btn:hover {
          background: var(--color-primary);
          color: white;
        }

        .shift-badge-wrapper { position: relative; }
        .shift-badge {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          user-select: none;
        }
        .shift-badge.active { background: rgba(46, 125, 50, 0.05); color: #2e7d32; }
        .shift-badge.ended { background: rgba(198, 40, 40, 0.05); color: #C62828; }

        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .dot-active { background: #2e7d32; }
        .dot-ended { background: #C62828; }

        .shift-menu { position: absolute; top: calc(100% + 4px); right: 0; background: white; border: 1px solid var(--color-border); border-radius: 10px; box-shadow: var(--shadow-soft); overflow: hidden; z-index: 20; min-width: 160px; }
        .shift-menu-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.65rem 1rem; border: none; background: none; font-size: 0.82rem; font-weight: 600; color: var(--color-primary); cursor: pointer; }
        .shift-menu-item:hover { background: var(--color-sidebar); }

        .icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          color: var(--color-text-muted);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          cursor: pointer;
          position: relative;
          transition: var(--transition-smooth);
        }

        .icon-btn:hover {
          color: var(--color-primary);
          background: var(--color-accent-soft);
        }

        .shift-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 15; }
        .font-support {
          gap: 0.25rem;
          width: auto;
          padding: 0 0.5rem;
        }

        .tooltip-support {
          font-size: 0.75rem;
          font-weight: 700;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-container {
          background: white;
          width: 420px;
          border-radius: 20px;
          box-shadow: var(--shadow-soft);
          overflow: hidden;
          border: 1px solid var(--color-border);
        }

        .modal-header {
          padding: 1.25rem 1.5rem;
          background: var(--color-sidebar);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--color-border);
        }

        .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-primary); }
        .close-modal { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }

        .modal-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-group label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); }
        
        .form-group input, .form-group select {
          padding: 0.75rem 0.85rem;
          border-radius: 10px;
          border: 1px solid var(--color-border);
          font-size: 0.9rem;
          color: var(--color-primary);
          font-weight: 600;
          background: white;
          outline: none;
        }

        .guest-selector { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.35rem; }
        .guest-selector button {
          padding: 0.6rem;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          font-weight: 700;
          color: var(--color-text-muted);
          background: white;
          cursor: pointer;
        }
        .guest-selector button.active {
          background: var(--color-primary);
          color: white;
          border-color: var(--color-primary);
        }

        .modal-footer { margin-top: 0.75rem; }
        .start-btn {
          width: 100%;
          background: var(--color-primary);
          color: white;
          padding: 0.95rem;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border: none;
          cursor: pointer;
        }
        .start-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </header>
  );
};

export default Header;
