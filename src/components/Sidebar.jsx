import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, 
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Activity,
  Globe,
  Sliders,
  Utensils, 
  Archive,
  BarChart3,
  Users,
  Settings,
  Wallet,
  QrCode,
  UserCog,
  History,
  Palette,
  ShieldCheck,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const location = useLocation();
  const { logoUrl } = useTheme();
  const { isPlatformAdmin } = useAuth();
  const [dailyOpsOpen, setDailyOpsOpen] = useState(true);

  return (
    <div className="sidebar">
      {/* Brand Header styled like Petpooja POSS */}
      <div className="sidebar-logo">
        <div className="logo-icon-container">
          {logoUrl
            ? <img src={logoUrl} alt="Logo" className="logo-icon-img" />
            : <div className="logo-icon-mark">S</div>}
        </div>
        <div className="logo-text">
          <h1>SPICE OS</h1>
          <span>POINT OF SALE</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {/* Dashboard Link */}
        <NavLink 
          to="/dashboard"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>

        {/* Payments Link */}
        <NavLink 
          to="/payments"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Wallet size={20} />
          <span>Payments</span>
        </NavLink>

        {/* Collapsible Daily Operations Group */}
        <div className={`nav-group-container ${dailyOpsOpen ? 'is-open' : ''}`}>
          <button 
            className={`nav-item group-trigger ${location.pathname === '/billing' ? 'active-parent' : ''}`}
            onClick={() => setDailyOpsOpen(!dailyOpsOpen)}
          >
            <ClipboardList size={20} />
            <span className="flex-grow">Daily Operations</span>
            {dailyOpsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {dailyOpsOpen && (
            <div className="group-children">
              <NavLink 
                to="/billing"
                className={({ isActive }) => `nav-item sub-item ${isActive && !location.search.includes('tab=online') && !location.search.includes('tab=actions') ? 'active' : ''}`}
              >
                <Activity size={18} />
                <span>Live Orders</span>
              </NavLink>
              <NavLink 
                to="/billing?tab=online"
                className={({ isActive }) => `nav-item sub-item ${location.search.includes('tab=online') ? 'active' : ''}`}
              >
                <Globe size={18} />
                <span>Online Orders</span>
              </NavLink>
              <NavLink 
                to="/billing?tab=actions"
                className={({ isActive }) => `nav-item sub-item ${location.search.includes('tab=actions') ? 'active' : ''}`}
              >
                <Sliders size={18} />
                <span>Store Actions</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Menu Link */}
        <NavLink 
          to="/menu"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Utensils size={20} />
          <span>Menu Catalog</span>
        </NavLink>

        {/* Inventory (Placeholder) */}
        <div className="nav-item disabled-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <Archive size={20} />
            <span>Inventory</span>
          </div>
          <span className="badge">New</span>
        </div>

        {/* Reports Link */}
        <NavLink 
          to="/reports"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <BarChart3 size={20} />
          <span>Reports</span>
        </NavLink>

        {/* Orders Link */}
        <NavLink 
          to="/orders"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <History size={20} />
          <span>Order History</span>
        </NavLink>

        {/* Customers Link */}
        <NavLink 
          to="/customers"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Users size={20} />
          <span>Customers</span>
        </NavLink>

        {/* QR Management Link */}
        <NavLink 
          to="/qr-management"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <QrCode size={20} />
          <span>QR Management</span>
        </NavLink>

        {/* Staff Link */}
        <NavLink 
          to="/staff"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <UserCog size={20} />
          <span>Staff</span>
        </NavLink>
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        {isPlatformAdmin && (
          <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <ShieldCheck size={20} />
            <span>Platform Admin</span>
          </NavLink>
        )}
        <NavLink to="/branding" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Palette size={20} />
          <span>Branding</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item settings-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
        
        <div className="user-card">
          <div className="avatar-small">AR</div>
          <div className="user-info">
            <p className="user-name">Alex Rivera</p>
            <p className="user-role">Manager</p>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-text-muted)', paddingTop: '0.75rem', letterSpacing: '0.04em' }}>
          Powered by Spice OS
        </div>
      </div>

      <style>{`
        .sidebar {
          width: 280px;
          height: 100vh;
          background: var(--color-sidebar);
          color: var(--color-primary);
          display: flex;
          flex-direction: column;
          padding: 2rem 1rem;
          border-right: 1px solid var(--color-border);
          overflow-y: auto;
          flex-shrink: 0;
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-bottom: 2.5rem;
          padding: 0.5rem;
          border-bottom: 2px solid var(--color-border);
          padding-bottom: 1.5rem;
        }

        .logo-icon-container {
          width: 44px;
          height: 44px;
          background: var(--color-primary);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(78, 62, 47, 0.2);
          overflow: hidden;
        }

        .logo-icon-mark {
          color: var(--color-accent);
          font-weight: 800;
          font-size: 1.5rem;
          font-family: serif;
        }

        .logo-icon-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .logo-text h1 {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--color-primary);
          line-height: 1.1;
          letter-spacing: 1px;
        }

        .logo-text span {
          font-size: 0.7rem;
          color: var(--color-accent);
          font-weight: 700;
          display: block;
          margin-top: 0.15rem;
          letter-spacing: 0.5px;
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          color: var(--color-text-muted);
          font-size: 0.95rem;
          font-weight: 600;
          transition: var(--transition-smooth);
          text-decoration: none;
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .nav-item:hover {
          background: rgba(197, 168, 128, 0.1);
          color: var(--color-primary);
        }

        .nav-item.active {
          background: var(--color-primary);
          color: white;
        }

        .nav-item.active-parent {
          background: rgba(78, 62, 47, 0.05);
          color: var(--color-primary);
        }

        .group-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .flex-grow {
          flex-grow: 1;
        }

        .group-children {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          padding-left: 1rem;
          margin-top: 0.2rem;
          border-left: 1.5px dashed var(--color-border);
          margin-left: 1.5rem;
        }

        .sub-item {
          padding: 0.6rem 0.85rem;
          font-size: 0.85rem;
          border-radius: 8px;
        }

        .disabled-item {
          opacity: 0.6;
          cursor: not-allowed;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .disabled-item:hover {
          background: transparent;
          color: var(--color-text-muted);
        }

        .badge {
          background: var(--color-accent);
          color: var(--color-primary);
          font-size: 0.65rem;
          font-weight: 800;
          padding: 0.15rem 0.4rem;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .sidebar-footer {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          border-top: 1px solid var(--color-border);
          padding-top: 1.5rem;
        }

        .settings-item {
          margin-bottom: 0.25rem;
        }

        .user-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem;
          background: rgba(197, 168, 128, 0.05);
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          margin: 0.25rem 0;
        }

        .avatar-small {
          width: 32px;
          height: 32px;
          background: var(--color-primary);
          border-radius: 8px;
          color: var(--color-accent);
          font-size: 0.75rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .user-name {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--color-primary);
        }

        .user-role {
          font-size: 0.7rem;
          color: var(--color-text-muted);
        }

        .logout:hover {
          color: #d9534f;
          background: rgba(217, 83, 79, 0.05);
        }
      `}</style>
    </div>
  );
};

export default Sidebar;
