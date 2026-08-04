import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  CreditCard,
  Utensils,
  Package,
  BarChart3,
  History,
  Users,
  QrCode,
  UserPlus,
  Palette,
  Settings,
  ShieldCheck,
  HelpCircle,
  LogOut,
  ChevronUp,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

/**
 * Flat 12-item rail. "Live Orders" owns the whole /billing surface — its Online
 * Orders and Store Actions siblings live as tabs inside that screen rather than
 * as nested nav rows, so every destination is still one click away.
 */
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/billing', label: 'Live Orders', Icon: Activity, matches: ['/billing'] },
  { to: '/payments', label: 'Payments', Icon: CreditCard },
  { to: '/menu', label: 'Menu Catalog', Icon: Utensils },
  { to: '/inventory', label: 'Inventory', Icon: Package },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/orders', label: 'Order History', Icon: History },
  { to: '/customers', label: 'Customers', Icon: Users },
  { to: '/qr-management', label: 'QR Codes', Icon: QrCode },
  { to: '/staff', label: 'Staff', Icon: UserPlus },
];

const FOOTER_ITEMS = [
  { to: '/branding', label: 'Branding', Icon: Palette },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

function NavRow({ to, label, Icon, active }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `nav-item ${(active ?? isActive) ? 'active' : ''}`
      }
    >
      <span className="nav-icon"><Icon size={16} strokeWidth={2} /></span>
      {label}
    </NavLink>
  );
}

const Sidebar = () => {
  const location = useLocation();
  const { logoUrl } = useTheme();
  const { isPlatformAdmin, signOut, user } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);

  const isActive = (item) =>
    item.matches
      ? item.matches.some((m) => location.pathname.startsWith(m))
      : location.pathname === item.to;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          {logoUrl ? <img src={logoUrl} alt="Logo" /> : 'S'}
        </div>
        <div className="brand-text">
          <div className="brand-name">SPICE OS</div>
          <div className="brand-sub">POINT OF SALE</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.to} {...item} active={isActive(item)} />
        ))}

        {isPlatformAdmin && (
          <NavRow to="/admin" label="Platform Admin" Icon={ShieldCheck} />
        )}

        {FOOTER_ITEMS.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>

      <div className="account">
        {accountOpen && (
          <>
            <div className="account__backdrop" onClick={() => setAccountOpen(false)} />
            <div className="account__menu">
              <a className="account__item" href="mailto:support@spiceos.com">
                <HelpCircle size={15} /> Support
              </a>
              <button className="account__item account__item--danger" onClick={signOut}>
                <LogOut size={15} /> Sign out
              </button>
              {user?.email && <div className="account__who">{user.email}</div>}
            </div>
          </>
        )}

        <button
          className="user-card"
          onClick={() => setAccountOpen(!accountOpen)}
          title="Account"
        >
          <div className="user-avatar">AR</div>
          <div className="user-meta">
            <div className="user-name">Alex Rivera</div>
            <div className="user-role">Manager</div>
          </div>
          <ChevronUp size={15} className={`user-chev ${accountOpen ? 'is-open' : ''}`} />
        </button>
      </div>

      <div className="sidebar-credit">Powered by Spice OS</div>

      <style>{`
        .sidebar {
          width: 240px;
          flex-shrink: 0;
          height: 100vh;
          background: var(--color-sidebar);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          padding: 20px 14px;
          box-sizing: border-box;
          overflow-y: auto;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 8px 18px 8px;
          border-bottom: 1px solid var(--color-border);
        }

        .brand-mark {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border-radius: 11px;
          background: var(--color-primary);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 19px;
          overflow: hidden;
        }

        .brand-mark img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .brand-name {
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 0.02em;
          color: var(--color-text);
          line-height: 1.2;
        }

        .brand-sub {
          font-size: 10px;
          font-weight: 600;
          color: var(--color-text-muted);
          letter-spacing: 0.08em;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-top: 14px;
          flex: 1;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 14px;
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          font-weight: 500;
          color: var(--color-text-soft);
          background: transparent;
          text-decoration: none;
          transition: var(--transition-smooth);
        }

        .nav-item:hover {
          background: var(--color-well);
          color: var(--color-text);
        }

        .nav-item.active {
          background: var(--color-text);
          color: #fff;
          font-weight: 600;
        }

        .nav-item.active:hover {
          background: var(--color-text);
          color: #fff;
        }

        .nav-icon {
          display: flex;
          width: 18px;
          height: 18px;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .account { position: relative; margin-top: 12px; }

        .account__backdrop { position: fixed; inset: 0; z-index: 30; }

        .account__menu {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          right: 0;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: 0 12px 32px rgba(22, 24, 29, 0.14);
          padding: 6px;
          z-index: 31;
        }

        .account__item {
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

        .account__item:hover { background: var(--color-canvas); }
        .account__item--danger { color: var(--color-danger); }
        .account__item--danger:hover { background: var(--color-danger-soft); }

        .account__who {
          padding: 8px 12px 4px;
          margin-top: 4px;
          border-top: 1px solid var(--color-border-soft);
          font-size: 11.5px;
          color: var(--color-text-faint);
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-card {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px;
          border-radius: var(--radius-md);
          background: var(--color-canvas);
          border: 1px solid var(--color-border);
          text-align: left;
        }

        .user-card:hover { background: var(--color-well); }

        .user-chev {
          margin-left: auto;
          flex-shrink: 0;
          color: var(--color-text-faint);
          transition: var(--transition-smooth);
        }

        .user-chev.is-open { transform: rotate(180deg); }

        .user-avatar {
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--color-text);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
        }

        .user-meta { min-width: 0; }

        .user-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          font-size: 12px;
          color: var(--color-text-muted);
        }

        .sidebar-credit {
          text-align: center;
          font-size: 11px;
          color: var(--color-text-faint);
          padding: 12px 0 2px 0;
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
