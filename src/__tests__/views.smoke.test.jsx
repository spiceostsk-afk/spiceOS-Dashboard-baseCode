/**
 * Render smoke test for every redesigned screen.
 *
 * The other suites cover individual components; this one mounts each *view*
 * with its data hooks stubbed out, so a bad reference introduced during a
 * redesign fails here instead of in someone's browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

/* ---- Supabase: every call resolves to an empty result ---- */
const emptyResult = { data: [], error: null, count: 0 };

function queryStub() {
  const chain = {};
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in',
    'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle'];
  methods.forEach((m) => { chain[m] = vi.fn(() => chain); });
  chain.then = (resolve) => Promise.resolve(emptyResult).then(resolve);
  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => queryStub()),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) })) },
    channel: vi.fn(() => ({ on: vi.fn(), subscribe: vi.fn() })),
  },
  isMockMode: true,
}));

/* ---- Contexts ---- */
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { email: 'test@example.com' } },
    user: { email: 'test@example.com' },
    restaurantId: 'r1',
    isPlatformAdmin: true,
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    tokens: { primary: '#D62828', accent: '#E23744' },
    logoUrl: null,
    status: 'active',
    loading: false,
    saveTheme: vi.fn(),
    uploadLogo: vi.fn(),
    reload: vi.fn(),
  }),
  ThemeProvider: ({ children }) => children,
}));

/* ---- Data hooks ---- */
const money = (v) => `₹${Number(v || 0).toFixed(2)}`;

vi.mock('../hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    stats: {
      totalSales: 0, netSales: 0, todayOrders: 0, activeTables: 0,
      occupiedTables: 0, customerCount: 0, averageOrderValue: 0, totalOrders: 0,
    },
    sectionRevenue: [], dailyTrend: [], recentOrders: [], liveOrders: [],
    alerts: [], loading: false, error: null, refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/usePaymentsData', () => ({
  usePaymentsData: () => ({
    payments: [], loading: false, error: null, dateRange: 'today',
    setDateRange: vi.fn(), selectedPayment: null, setSelectedPayment: vi.fn(),
    summary: { totalCollections: 0, count: 0, average: 0 },
    refetch: vi.fn(), formatCurrency: money,
  }),
}));

vi.mock('../hooks/useReportsData', () => ({
  useReportsData: () => ({
    summary: { totalSales: 0, totalOrders: 0, avgOrderValue: 0, taxCollected: 0 },
    topItems: [], dailyBreakdown: [], loading: false, error: null,
    period: 'today', setPeriod: vi.fn(), refetch: vi.fn(), formatCurrency: money,
  }),
}));

vi.mock('../hooks/useOrdersData', () => ({
  useOrdersData: () => ({
    orders: [], loading: false, error: null, search: '', setSearch: vi.fn(),
    statusFilter: 'all', setStatusFilter: vi.fn(), dateRange: 'all', setDateRange: vi.fn(),
    selectedOrder: null, setSelectedOrder: vi.fn(), refetch: vi.fn(),
    formatCurrency: money, STATUS_FILTERS: ['all', 'completed', 'void'],
    handlePrintKot: vi.fn(),
  }),
}));

vi.mock('../hooks/useCustomersData', () => ({
  useCustomersData: () => ({
    customers: [], loading: false, error: null, selectedCustomer: null,
    setSelectedCustomer: vi.fn(), refetch: vi.fn(), formatCurrency: money,
  }),
}));

vi.mock('../hooks/useStaffData', () => ({
  useStaffData: () => ({
    staff: [], loading: false, error: null, saving: false, roles: [],
    addStaff: vi.fn(), updateStaff: vi.fn(), deleteStaff: vi.fn(), regeneratePin: vi.fn(),
  }),
}));

vi.mock('../hooks/useSettingsData', () => ({
  useSettingsData: () => ({
    settings: {
      restaurant: { name: '', gstin: '', address: '', phone: '', email: '' },
      tax: { gstRate: 5 },
      serviceCharge: { defaultRate: 10, enabled: true },
      receipt: { footerText: '', showGst: true },
    },
    loading: false, error: null, saving: false,
    updateSetting: vi.fn(), saveSettings: vi.fn(), refreshSettings: vi.fn(),
  }),
}));

vi.mock('../hooks/useBillingData', () => ({
  useBillingData: () => ({
    state: {
      tables: [], sections: [], activeTab: 'tables', activeArea: 'all',
      loadingWorkspace: false, workspaceError: null,
    },
    sessionState: { session: null, items: [], loadingSession: false, sessionError: null, isPaid: false },
    uiState: {
      paymentMethod: 'cash', isEditingQuantities: false, loadingAction: false,
      discountType: 'none', discountValue: 0, showServiceCharge: false,
      serviceChargePercent: 10, splitPayments: [{ method: 'cash', amount: 0 }], voidReason: '',
    },
    modalState: {
      aggregators: { zomato: true, swiggy: false }, showAssignModal: false,
      showMoveTableModal: false, showMergeOrderModal: false, showSplitBillModal: false,
      showEditItemModal: false, availableTables: [], occupiedSessions: [],
      selectedTableForNewOrder: null, customerData: { name: '', phone: '', guests: 2 },
      itemAssignments: {}, splitTab: 'equal', splitWays: 2, editQty: 1, selectedEditItem: null,
      selectedMoveTableId: '', selectedMergeSessionId: '',
    },
    subtotal: 0, discountAmount: 0, serviceCharge: 0, cgst: 0, sgst: 0, total: 0,
    filteredTables: [], cleaningCount: 0,
    closeModals: vi.fn(), setPaymentMethod: vi.fn(), setEditingQuantities: vi.fn(),
    setDiscountType: vi.fn(), setDiscountValue: vi.fn(), setServiceChargePercent: vi.fn(),
    toggleServiceCharge: vi.fn(), setSplitPayments: vi.fn(), setAmountPaid: vi.fn(),
    setVoidReason: vi.fn(), updateTab: vi.fn(), handleStartSession: vi.fn(),
    handleMarkAsPaid: vi.fn(), handleAddManualItem: vi.fn(), handleUpdateItemQty: vi.fn(),
    handleOpenMoveTable: vi.fn(), handleConfirmMoveTable: vi.fn(), handleOpenMergeOrder: vi.fn(),
    handleConfirmMergeOrder: vi.fn(), handleHoldBill: vi.fn(), handleResumeBill: vi.fn(),
    handleVoidBill: vi.fn(), handlePrint: vi.fn(), handleFreeAllCleaningTables: vi.fn(),
    handleFreeTable: vi.fn(), setModalState: vi.fn(),
    isOnline: true, syncing: false, syncProgress: { current: 0, total: 0 },
    lastSyncResult: null, syncNow: vi.fn(),
  }),
}));

vi.mock('../lib/db', () => ({
  putMany: vi.fn(), getAll: vi.fn(() => Promise.resolve([])), put: vi.fn(),
  getById: vi.fn(), remove: vi.fn(), enqueueSync: vi.fn(),
  generateTempId: () => 'tmp-1', setDbTenant: vi.fn(), clearStore: vi.fn(),
}));

import Dashboard from '../views/Dashboard';
import Billing from '../views/Billing';
import MenuCatalog from '../views/MenuCatalog';
import QRManagement from '../views/QRManagement';
import Payments from '../views/Payments';
import Reports from '../views/Reports';
import Orders from '../views/Orders';
import Customers from '../views/Customers';
import Staff from '../views/Staff';
import Settings from '../views/Settings';
import Branding from '../views/Branding';
import Inventory from '../views/Inventory';
import Recipes from '../views/Recipes';

const VIEWS = [
  ['Dashboard', Dashboard],
  ['Live Orders', Billing],
  ['Menu Catalog', MenuCatalog],
  ['QR Codes', QRManagement],
  ['Payments', Payments],
  ['Reports', Reports],
  ['Order History', Orders],
  ['Customers', Customers],
  ['Staff', Staff],
  ['Settings', Settings],
  ['Branding', Branding],
  ['Inventory', Inventory],
];

describe('View render smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  VIEWS.forEach(([name, View]) => {
    it(`${name} renders without crashing`, () => {
      const { container } = render(
        <MemoryRouter>
          <View />
        </MemoryRouter>,
      );
      expect(container.firstChild).toBeTruthy();
    });
  });

  it('Dashboard shows the all-clear banner when there are no alerts', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('All running smoothly')).toBeInTheDocument();
  });

  // Inventory and Recipes read Supabase directly, so both settle a tick after
  // mount — findByText waits out the loading row the stub resolves through.
  it('Inventory shows its empty state once the fetch settles', async () => {
    render(<MemoryRouter><Inventory /></MemoryRouter>);
    expect(await screen.findByText('No items tracked yet')).toBeInTheDocument();
  });

  it('Recipes shows its empty state once the fetch settles', async () => {
    render(<MemoryRouter><Recipes /></MemoryRouter>);
    expect(await screen.findByText('No dishes on the menu yet')).toBeInTheDocument();
  });

  it('Recipes renders its four metric cards', async () => {
    render(<MemoryRouter><Recipes /></MemoryRouter>);
    expect(await screen.findByText('Recipes set')).toBeInTheDocument();
    expect(screen.getByText('Running low')).toBeInTheDocument();
    expect(screen.getByText('Cannot make')).toBeInTheDocument();
  });

  it('Payments renders its three metric cards', () => {
    render(<MemoryRouter><Payments /></MemoryRouter>);
    expect(screen.getByText('Total collections')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('Average per bill')).toBeInTheDocument();
  });
});
