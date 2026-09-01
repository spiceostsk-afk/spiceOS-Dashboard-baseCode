import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './components/Login';
import Signup from './components/Signup';
import NoTenant from './components/NoTenant';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { OutletProvider } from './context/OutletContext';
import { setDbTenant } from './lib/db';
import Dashboard from './views/Dashboard';
import Branding from './views/Branding';
import SuperAdmin from './views/SuperAdmin';
import MenuCatalog from './views/MenuCatalog';
import Billing from './views/Billing';
import Payments from './views/Payments';
import Reports from './views/Reports';
import Settings from './views/Settings';
import Customers from './views/Customers';
import QRManagement from './views/QRManagement';
import Staff from './views/Staff';
import Orders from './views/Orders';
import RawMaterials from './views/masters/RawMaterials';
import Recipes from './views/Recipes';
import ClosingStock from './views/inventory/ClosingStock';
import AvailableStock from './views/inventory/AvailableStock';
import Purchase from './views/inventory/Purchase';
import Wastage from './views/inventory/Wastage';
import Transfer from './views/inventory/Transfer';
import Vendors from './views/inventory/Vendors';
import StockSummary from './views/inventory/StockSummary';
import OpeningStock from './views/inventory/OpeningStock';
import UnitMaster from './views/masters/UnitMaster';
import CategoryMaster from './views/masters/CategoryMaster';

function SuspendedScreen() {
  const { signOut } = useAuth();
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', textAlign: 'center', padding: '2rem' }}>
      <h1 style={{ color: 'var(--color-primary)' }}>Account suspended</h1>
      <p style={{ color: 'var(--color-text-muted)', maxWidth: 420 }}>
        This restaurant's account is currently suspended. Please contact support to reactivate it.
      </p>
      <button onClick={signOut} style={{ marginTop: '0.5rem', background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.7rem 1.2rem', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
        Sign out
      </button>
    </div>
  );
}

function AppShell() {
  const { status } = useTheme();
  const { isPlatformAdmin } = useAuth();

  // Suspended/cancelled tenants are blocked — platform admins are exempt so they
  // can still reach /admin to reactivate.
  if ((status === 'suspended' || status === 'cancelled') && !isPlatformAdmin) {
    return <SuspendedScreen />;
  }

  return (
    <Router>
      <div className="app-container">
        <Sidebar />

        <main className="main-content">
          <Header />

          <div className="scrollable-area">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/menu" element={<MenuCatalog />} />
              <Route path="/inventory" element={<RawMaterials />} />
              <Route path="/inventory/available-stock" element={<AvailableStock />} />
              <Route path="/inventory/opening-stock" element={<OpeningStock />} />
              <Route path="/inventory/closing-stock" element={<ClosingStock />} />
              <Route path="/inventory/purchase" element={<Purchase />} />
              <Route path="/inventory/wastage" element={<Wastage />} />
              <Route path="/inventory/transfer" element={<Transfer />} />
              <Route path="/inventory/vendors" element={<Vendors />} />
              <Route path="/inventory/summary" element={<StockSummary />} />
              <Route path="/inventory/units" element={<UnitMaster />} />
              <Route path="/inventory/categories" element={<CategoryMaster />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/qr-management" element={<QRManagement />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/branding" element={<Branding />} />
              <Route path="/admin" element={<SuperAdmin />} />
              {/* Fallback for other routes */}
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

/** Login / Signup toggle shown when there's no session. */
function AuthFlow() {
  const [view, setView] = React.useState('login');
  return view === 'login'
    ? <Login onSwitch={() => setView('signup')} />
    : <Signup onSwitch={() => setView('login')} />;
}

/** Decides what to render based on auth + tenant state. */
function Gate() {
  const { loading, session, restaurantId } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--color-text-muted)',
        fontWeight: 600,
      }}>
        Loading…
      </div>
    );
  }

  if (!session) return <AuthFlow />;
  if (!restaurantId) return <NoTenant />;
  // Namespace the offline cache to this tenant before the app (and its offline
  // hooks) mount. Runs top-down before AppShell's children, so the DB opens
  // with the right per-tenant name.
  setDbTenant(restaurantId);
  return (
    <ThemeProvider>
      <OutletProvider>
        <AppShell />
      </OutletProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
