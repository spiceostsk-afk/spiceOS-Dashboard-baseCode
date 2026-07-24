import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { DollarSign, Clock, Users } from 'lucide-react';

/* ============================================================
   1. CALCULATIONS — Pure business logic (src/lib/calculations.js)
   ============================================================ */
import {
  TAX_RATE, CGST_RATE, SGST_RATE,
  SESSION_STATUS, TABLE_STATUS,
  calcSubtotal, calcDiscountAmount, calcServiceCharge,
  calcTax, calcCgst, calcSgst, calcTotal,
  FORMAT_CURRENCY,
} from '../lib/calculations';

describe('Calculations — Billing Math', () => {
  /* ---- calcSubtotal ---- */
  describe('calcSubtotal()', () => {
    it('returns 0 for empty array', () => {
      expect(calcSubtotal([])).toBe(0);
    });
    it('sums price * qty for multiple items', () => {
      const items = [
        { price: 199, qty: 2 },
        { price: 49.5, qty: 3 },
      ];
      expect(calcSubtotal(items)).toBeCloseTo(546.5);
    });
    it('handles single item', () => {
      expect(calcSubtotal([{ price: 500, qty: 1 }])).toBe(500);
    });
    it('handles zero quantities', () => {
      expect(calcSubtotal([{ price: 100, qty: 0 }])).toBe(0);
    });
    it('preserves decimals', () => {
      expect(calcSubtotal([{ price: 0.99, qty: 3 }])).toBeCloseTo(2.97);
    });
    it('handles large values without overflow', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ price: 1000, qty: 1 }));
      expect(calcSubtotal(items)).toBe(100000);
    });
  });

  /* ---- calcDiscountAmount ---- */
  describe('calcDiscountAmount()', () => {
    it('returns 0 for zero/negative/null values', () => {
      expect(calcDiscountAmount(1000, 'percentage', 0)).toBe(0);
      expect(calcDiscountAmount(1000, 'flat', -50)).toBe(0);
      expect(calcDiscountAmount(1000, 'percentage', null)).toBe(0);
    });
    it('applies percentage discount correctly', () => {
      expect(calcDiscountAmount(2000, 'percentage', 10)).toBe(200);
      expect(calcDiscountAmount(2000, 'percentage', 50)).toBe(1000);
    });
    it('caps percentage discount at 100%', () => {
      expect(calcDiscountAmount(1000, 'percentage', 200)).toBe(1000);
    });
    it('applies flat discount', () => {
      expect(calcDiscountAmount(1000, 'flat', 250)).toBe(250);
    });
    it('caps flat discount at subtotal', () => {
      expect(calcDiscountAmount(500, 'flat', 1000)).toBe(500);
    });
    it('returns 0 for unknown discount type', () => {
      expect(calcDiscountAmount(1000, 'invalid', 100)).toBe(0);
    });
    it('handles decimal discount values', () => {
      expect(calcDiscountAmount(1000, 'percentage', 12.5)).toBe(125);
    });
  });

  /* ---- calcServiceCharge ---- */
  describe('calcServiceCharge()', () => {
    it('returns 0 for zero/null percentage', () => {
      expect(calcServiceCharge(1000, 0)).toBe(0);
      expect(calcServiceCharge(1000, null)).toBe(0);
    });
    it('applies correct percentage', () => {
      expect(calcServiceCharge(1000, 10)).toBe(100);
      expect(calcServiceCharge(500, 5)).toBe(25);
    });
    it('caps at 50%', () => {
      expect(calcServiceCharge(1000, 100)).toBe(500);
    });
    it('ignores negative', () => {
      expect(calcServiceCharge(1000, -5)).toBe(0);
    });
    it('handles decimal percentages', () => {
      expect(calcServiceCharge(1000, 7.5)).toBeCloseTo(75);
    });
  });

  /* ---- calcTax / calcCgst / calcSgst ---- */
  describe('Tax calculations', () => {
    it('calcTax applies TAX_RATE', () => {
      expect(calcTax(1000)).toBe(1000 * TAX_RATE);
      expect(calcTax(0)).toBe(0);
    });
    it('calcCgst applies CGST_RATE (5%)', () => {
      expect(calcCgst(1000)).toBe(50);
      expect(calcCgst(0)).toBe(0);
    });
    it('calcSgst applies SGST_RATE (5%)', () => {
      expect(calcSgst(1000)).toBe(50);
      expect(calcSgst(0)).toBe(0);
    });
    it('CGST + SGST equals calcTax', () => {
      const val = 1000;
      expect(calcCgst(val) + calcSgst(val)).toBe(calcTax(val));
    });
  });

  /* ---- calcTotal ---- */
  describe('calcTotal()', () => {
    it('computes total = subtotal - discount + SC + tax(subtotal)', () => {
      const subtotal = 1000;
      const result = calcTotal(subtotal, 0, 0);
      expect(result).toBe(subtotal + subtotal * TAX_RATE);
    });
    it('accounts for discount and SC together', () => {
      const subtotal = 1000;
      const discount = 100;
      const sc = 50;
      const expected = (subtotal - discount + sc) + subtotal * TAX_RATE;
      expect(calcTotal(subtotal, discount, sc)).toBe(expected);
    });
    it('never returns negative', () => {
      expect(calcTotal(0, 500, 0)).toBe(0);
      expect(calcTotal(100, 200, 0)).toBe(0);
    });
    it('handles zero subtotal', () => {
      expect(calcTotal(0, 0, 0)).toBe(0);
    });
  });

  /* ---- Constants ---- */
  describe('Constants and formatting', () => {
    it('TAX_RATE = 0.1 (10%)', () => { expect(TAX_RATE).toBe(0.1); });
    it('CGST_RATE = 0.05 (5%)', () => { expect(CGST_RATE).toBe(0.05); });
    it('SGST_RATE = 0.05 (5%)', () => { expect(SGST_RATE).toBe(0.05); });
    it('SESSION_STATUS has all 5 states', () => {
      expect(Object.keys(SESSION_STATUS)).toHaveLength(5);
      expect(SESSION_STATUS.active).toBe('active');
      expect(SESSION_STATUS.void).toBe('void');
    });
    it('TABLE_STATUS has all 4 states', () => {
      expect(Object.keys(TABLE_STATUS)).toHaveLength(4);
      expect(TABLE_STATUS.available).toBe('available');
      expect(TABLE_STATUS.cleaning).toBe('cleaning');
    });
    it('FORMAT_CURRENCY formats INR correctly', () => {
      expect(FORMAT_CURRENCY.format(1000)).toContain('1,000');
      expect(FORMAT_CURRENCY.format(0)).toContain('0');
    });
  });
});

/* ============================================================
   2. INDEXED DB — Data persistence (src/lib/db.js)
   ============================================================ */
import * as db from '../lib/db';

describe('IndexedDB — Data Layer', () => {
  beforeEach(async () => {
    await db.clearStore('tables');
    await db.clearStore('sections');
    await db.clearStore('menu_items');
    await db.clearStore('menu_categories');
    await db.clearStore('sessions');
    await db.clearStore('orders');
    await db.clearStore('order_items');
    await db.clearStore('sync_queue');
    await db.clearStore('meta');
  });

  it('CRUD cycle: create, read, update, delete', async () => {
    await db.put('menu_items', { id: 'm1', item_name: 'Biryani', price: 250 });
    let item = await db.getById('menu_items', 'm1');
    expect(item.item_name).toBe('Biryani');

    await db.put('menu_items', { id: 'm1', item_name: 'Chicken Biryani', price: 280 });
    item = await db.getById('menu_items', 'm1');
    expect(item.item_name).toBe('Chicken Biryani');

    await db.remove('menu_items', 'm1');
    item = await db.getById('menu_items', 'm1');
    expect(item).toBeNull();
  });

  it('bulk putMany', async () => {
    const items = [
      { id: 'a', name: 'Item A' },
      { id: 'b', name: 'Item B' },
      { id: 'c', name: 'Item C' },
    ];
    const ids = await db.putMany('menu_items', items);
    expect(ids).toHaveLength(3);
    const all = await db.getAll('menu_items');
    expect(all).toHaveLength(3);
  });

  it('meta store set/get', async () => {
    await db.setMeta('restaurant_name', 'Spice OS');
    expect(await db.getMeta('restaurant_name')).toBe('Spice OS');
    expect(await db.getMeta('nonexistent')).toBeNull();
  });

  it('generateTempId creates unique temp_ prefixed IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(db.generateTempId());
    expect(ids.size).toBe(100);
    ids.forEach((id) => expect(id).toMatch(/^temp_/));
  });

  it('sync queue enqueue and retrieval', async () => {
    await db.enqueueSync({
      action: 'insert', table: 'orders',
      data: { id: 'temp_1', subtotal: 500, tax: 50, total: 550 },
    });
    await db.enqueueSync({
      action: 'insert', table: 'order_items',
      data: { id: 'temp_2', order_id: 'temp_1', menu_item_id: 'm1', quantity: 2 },
    });
    const pending = await db.getPendingSyncItems();
    expect(pending).toHaveLength(2);
    expect(pending[0].action).toBe('insert');
    expect(pending[0].retries).toBe(0);
  });

  it('removeSyncItem removes from queue', async () => {
    const id = await db.enqueueSync({ action: 'insert', table: 'sessions', data: {} });
    const pendingBefore = await db.getPendingSyncItems();
    expect(pendingBefore).toHaveLength(1);

    await db.removeSyncItem(id);
    const pendingAfter = await db.getPendingSyncItems();
    expect(pendingAfter).toHaveLength(0);
  });

  it('clearStore empties a store', async () => {
    await db.put('sections', { id: 's1', section_name: 'Main' });
    await db.put('sections', { id: 's2', section_name: 'VIP' });
    await db.clearStore('sections');
    expect(await db.getAll('sections')).toEqual([]);
  });
});

/* ============================================================
   3. COMPONENT RENDERING — UI components
   ============================================================ */
import StatCard from '../components/dashboard/StatCard';
import ConnectivityBanner from '../components/billing/ConnectivityBanner';
import TablesWorkspace from '../components/billing/TablesWorkspace';
import BillingDetails from '../components/billing/BillingDetails';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

describe('Components — Rendering & States', () => {
  /* ---- StatCard ---- */
  describe('StatCard', () => {
    it('displays title, value, subtitle', () => {
      render(
        <StatCard title="Revenue" value="₹12,450" subtitle="↑ 8% vs yesterday" icon={DollarSign} accentColor="#2E7D32" />
      );
      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('₹12,450')).toBeInTheDocument();
      expect(screen.getByText('↑ 8% vs yesterday')).toBeInTheDocument();
    });
    it('shows loading spinner when loading', () => {
      const { container } = render(
        <StatCard title="Orders" value="" loading={true} icon={DollarSign} accentColor="#1565C0" />
      );
      expect(container.querySelector('.spinner')).toBeTruthy();
    });
    it('shows em dash for null value', () => {
      render(<StatCard title="Customers" value={null} icon={Users} accentColor="#6A1B9A" />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });
    it('shows em dash for undefined value', () => {
      render(<StatCard title="AOV" value={undefined} icon={Clock} accentColor="#E65100" />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });
    it('does not render subtitle when absent', () => {
      const { container } = render(
        <StatCard title="Test" value="100" icon={DollarSign} accentColor="#333" />
      );
      expect(container.querySelector('.card-sub')?.textContent?.trim() || '').toBe('');
    });
  });

  /* ---- ConnectivityBanner ---- */
  describe('ConnectivityBanner', () => {
    const baseProps = { syncProgress: { current: 0, total: 0 }, syncNow: () => {} };

    it('shows offline message when !isOnline', () => {
      render(<ConnectivityBanner isOnline={false} syncing={false} lastSyncResult={null} {...baseProps} />);
      expect(screen.getByText(/Offline Mode/)).toBeInTheDocument();
    });
    it('shows syncing state with progress', () => {
      render(<ConnectivityBanner isOnline={true} syncing={true} lastSyncResult={null} {...baseProps} syncProgress={{ current: 3, total: 5 }} />);
      expect(screen.getByText(/Syncing data/)).toBeInTheDocument();
      expect(screen.getByText('3/5')).toBeInTheDocument();
    });
    it('shows synced count after success', () => {
      render(<ConnectivityBanner isOnline={true} syncing={false} lastSyncResult={{ synced: 5, failed: 0 }} {...baseProps} />);
      expect(screen.getByText(/Synced 5 items/)).toBeInTheDocument();
    });
    it('shows failed count when present', () => {
      render(<ConnectivityBanner isOnline={true} syncing={false} lastSyncResult={{ synced: 3, failed: 2 }} {...baseProps} />);
      expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    });
    it('handles singular "item" for count of 1', () => {
      render(<ConnectivityBanner isOnline={true} syncing={false} lastSyncResult={{ synced: 1, failed: 0 }} {...baseProps} />);
      expect(screen.getByText(/Synced 1 item/)).toBeInTheDocument();
    });
    it('returns null when online with no sync result', () => {
      const { container } = render(<ConnectivityBanner isOnline={true} syncing={false} lastSyncResult={null} {...baseProps} />);
      expect(container.innerHTML).toBe('');
    });
  });

  /* ---- TablesWorkspace ---- */
  describe('TablesWorkspace', () => {
    const sections = [{ id: 'sec1', section_name: 'Main Hall' }];
    const mockTables = [
      { id: 't1', table_number: 1, capacity: 4, status: 'available', active_session: null },
      { id: 't2', table_number: 2, capacity: 2, status: 'occupied', active_session: { id: 's1', customer_name: 'John', guest_count: 2, started_at: new Date().toISOString() } },
      { id: 't3', table_number: 3, capacity: 6, status: 'billing', active_session: { id: 's2', customer_name: 'Jane', guest_count: 4, started_at: new Date().toISOString() } },
      { id: 't4', table_number: 4, capacity: 4, status: 'cleaning', active_session: null },
    ];

    it('renders error state', () => {
      render(<TablesWorkspace tables={[]} sections={[]} activeArea="all" loading={false} error="DB connection failed" selectedSessionId={null} sessionTableId={null} onSelectArea={() => {}} onTableClick={() => {}} />);
      expect(screen.getByText(/DB connection failed/)).toBeInTheDocument();
    });
    it('renders loading state', () => {
      render(<TablesWorkspace tables={[]} sections={[]} activeArea="all" loading={true} error={null} selectedSessionId={null} sessionTableId={null} onSelectArea={() => {}} onTableClick={() => {}} />);
      expect(screen.getByText(/Loading tables layout/)).toBeInTheDocument();
    });
    it('renders empty state when no tables', () => {
      render(<TablesWorkspace tables={[]} sections={sections} activeArea="all" loading={false} error={null} selectedSessionId={null} sessionTableId={null} onSelectArea={() => {}} onTableClick={() => {}} />);
      expect(screen.getByText(/No tables found/)).toBeInTheDocument();
    });
    it('renders all table cards with statuses', () => {
      render(<TablesWorkspace tables={mockTables} sections={sections} activeArea="all" loading={false} error={null} selectedSessionId={null} sessionTableId={null} onSelectArea={() => {}} onTableClick={() => {}} onFreeTable={() => {}} />);
      expect(screen.getByText('T - 1')).toBeInTheDocument();
      expect(screen.getByText('T - 2')).toBeInTheDocument();
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('AVAILABLE')).toBeInTheDocument();
      expect(screen.getByText('OCCUPIED')).toBeInTheDocument();
      expect(screen.getByText('BILLING')).toBeInTheDocument();
      expect(screen.getByText('CLEANING')).toBeInTheDocument();
    });
    it('renders area filter buttons', () => {
      render(<TablesWorkspace tables={mockTables} sections={sections} activeArea="all" loading={false} error={null} selectedSessionId={null} sessionTableId={null} onSelectArea={() => {}} onTableClick={() => {}} />);
      expect(screen.getByText('All Areas')).toBeInTheDocument();
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
    });
    it('calls onFreeTable when Free button clicked on cleaning table', () => {
      const onFree = vi.fn();
      render(<TablesWorkspace tables={mockTables} sections={sections} activeArea="all" loading={false} error={null} selectedSessionId={null} sessionTableId={null} onSelectArea={() => {}} onTableClick={() => {}} onFreeTable={onFree} />);
      const freeBtn = screen.getByText('Free');
      fireEvent.click(freeBtn);
      expect(onFree).toHaveBeenCalledWith('t4');
    });
  });

  /* ---- BillingDetails ---- */
  describe('BillingDetails', () => {
    const noop = () => {};
    const baseProps = {
      sessionId: null, session: null, items: [], loading: false, error: null,
      isPaid: false, subtotal: 0, discountAmount: 0, serviceCharge: 0,
      cgst: 0, sgst: 0, total: 0, paymentMethod: 'cash',
      isEditingQuantities: false, loadingAction: false,
      discountType: 'none', discountValue: 0,
      showServiceCharge: false, serviceChargePercent: 0,
      splitPayments: [], isOnline: true,
      onCloseSession: noop, onNavigateMenu: noop, onEditItem: noop,
      onUpdateQty: noop, onDeleteItem: noop, onToggleEdit: noop,
      onSelectPayment: noop, onSettle: noop, onPrint: noop,
      onMoveTable: noop, onSplit: noop, onHold: noop, onVoid: noop,
      onAddManualItem: noop, onSetDiscountType: noop, onSetDiscountValue: noop,
      onToggleServiceCharge: noop, onSetServiceChargePercent: noop,
      onUpdateSplitPayment: noop, onAddSplitPayment: noop,
      onRemoveSplitPayment: noop, onSettlePartial: noop,
    };

    it('shows empty state when no session selected', () => {
      render(<BillingDetails {...baseProps} />);
      expect(screen.getByText(/Select an active table/)).toBeInTheDocument();
    });
    it('shows loading state', () => {
      render(<BillingDetails {...baseProps} sessionId="s1" loading={true} />);
      expect(screen.getByText(/Loading session bill details/)).toBeInTheDocument();
    });
    it('shows error state', () => {
      render(<BillingDetails {...baseProps} sessionId="s1" error="Session not found" />);
      expect(screen.getByText(/Session not found/)).toBeInTheDocument();
    });
    it('shows null session message', () => {
      render(<BillingDetails {...baseProps} sessionId="s1" session={null} />);
      expect(screen.getByText(/Active Session could not be loaded/)).toBeInTheDocument();
    });
    it('renders session header with table and customer', () => {
      const session = {
        id: 's1',
        customer_name: 'Alice',
        guest_count: 3,
        restaurant_tables: { table_number: 5 },
      };
      render(<BillingDetails {...baseProps} sessionId="s1" session={session} />);
      expect(screen.getByText(/Table 5/)).toBeInTheDocument();
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
      expect(screen.getByText(/3 Guests/)).toBeInTheDocument();
    });
    it('renders items list', () => {
      const session = { id: 's1', restaurant_tables: { table_number: 1 } };
      const items = [
        { id: 'i1', name: 'Biryani', qty: 2, price: 250 },
        { id: 'i2', name: 'Naan', qty: 3, price: 40 },
      ];
      render(<BillingDetails {...baseProps} sessionId="s1" session={session} items={items} subtotal={620} total={682} />);
      expect(screen.getByText('Biryani')).toBeInTheDocument();
      expect(screen.getByText('Naan')).toBeInTheDocument();
    });
    it('shows empty order message when no items', () => {
      const session = { id: 's1', restaurant_tables: { table_number: 1 } };
      render(<BillingDetails {...baseProps} sessionId="s1" session={session} items={[]} isOnline={true} />);
      expect(screen.getByText(/No items punched/)).toBeInTheDocument();
    });
    it('paid state shows PAID badge', () => {
      const session = { id: 's1', restaurant_tables: { table_number: 1 } };
      render(<BillingDetails {...baseProps} sessionId="s1" session={session} isPaid={true} />);
      expect(screen.getByText(/• PAID/)).toBeInTheDocument();
    });
  });

  /* ---- Sidebar ---- */
  describe('Sidebar navigation', () => {
    it('renders brand and all nav links', () => {
      render(<MemoryRouter><Sidebar /></MemoryRouter>);
      expect(screen.getByText('SPICE OS')).toBeInTheDocument();
      expect(screen.getByText('POINT OF SALE')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Payments')).toBeInTheDocument();
      expect(screen.getByText('Daily Operations')).toBeInTheDocument();
      expect(screen.getByText('Live Orders')).toBeInTheDocument();
      expect(screen.getByText('Online Orders')).toBeInTheDocument();
      expect(screen.getByText('Store Actions')).toBeInTheDocument();
      expect(screen.getByText('Menu Catalog')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
      expect(screen.getByText('Order History')).toBeInTheDocument();
      expect(screen.getByText('Customers')).toBeInTheDocument();
      expect(screen.getByText('QR Management')).toBeInTheDocument();
      expect(screen.getByText('Staff')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
    it('shows user card', () => {
      render(<MemoryRouter><Sidebar /></MemoryRouter>);
      expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    });
    it('has Inventory placeholder with New badge', () => {
      render(<MemoryRouter><Sidebar /></MemoryRouter>);
      expect(screen.getByText('Inventory')).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
    });
  });

  /* ---- Header ---- */
  describe('Header titles', () => {
    it('shows POS Dashboard on /dashboard', () => {
      render(<MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter>);
      expect(screen.getByText('POS Dashboard')).toBeInTheDocument();
    });
    it('shows Order History on /orders', () => {
      render(<MemoryRouter initialEntries={['/orders']}><Header /></MemoryRouter>);
      expect(screen.getByText('Order History')).toBeInTheDocument();
    });
    it('shows shift badge', () => {
      render(<MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter>);
      expect(screen.getByText('Shift Active')).toBeInTheDocument();
    });
    it('shows New Order button when shift is active', () => {
      render(<MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter>);
      expect(screen.getByText('New Order')).toBeInTheDocument();
    });
  });
});

/* ============================================================
   4. FORMATTING UTILITIES
   ============================================================ */
describe('Formatting Utilities', () => {
  it('FORMAT_CURRENCY formats INR with 2 decimals', () => {
    const result = FORMAT_CURRENCY.format(1234.5);
    expect(result).toContain('1,234.50');
  });
  it('FORMAT_CURRENCY handles zero', () => {
    expect(FORMAT_CURRENCY.format(0)).toContain('0');
  });
  it('FORMAT_CURRENCY handles large numbers', () => {
    expect(FORMAT_CURRENCY.format(100000)).toContain('1,00,000');
  });
});

/* ============================================================
   5. EDGE CASES — Cross-cutting concerns
   ============================================================ */
describe('Edge Cases & Input Validation', () => {
  /* ---- Discount edge cases ---- */
  it('discount: percentage with 0% = no discount', () => {
    expect(calcDiscountAmount(500, 'percentage', 0)).toBe(0);
  });
  it('discount: flat with zero = no discount', () => {
    expect(calcDiscountAmount(500, 'flat', 0)).toBe(0);
  });
  it('discount: huge percentage is capped', () => {
    expect(calcDiscountAmount(100, 'percentage', 999)).toBe(100);
  });
  it('discount: tiny flat under subtotal', () => {
    expect(calcDiscountAmount(1000, 'flat', 0.50)).toBe(0.50);
  });

  /* ---- Service charge edge cases ---- */
  it('SC: 0% = 0', () => {
    expect(calcServiceCharge(500, 0)).toBe(0);
  });
  it('SC: huge percentage capped at 50%', () => {
    expect(calcServiceCharge(100, 200)).toBe(50);
  });

  /* ---- Total edge cases ---- */
  it('total: zero everything = 0', () => {
    expect(calcTotal(0, 0, 0)).toBe(0);
  });
  it('total: discount larger than subtotal = 0', () => {
    expect(calcTotal(100, 200, 0)).toBe(0);
  });
  it('total: high SC gives correct result', () => {
    const subtotal = 1000;
    expect(calcTotal(subtotal, 0, 500)).toBe(subtotal + 500 + subtotal * TAX_RATE);
  });

  /* ---- Subtotal edge cases ---- */
  it('subtotal: empty = 0', () => {
    expect(calcSubtotal([])).toBe(0);
  });
  it('subtotal: null/undefined items = crashes gracefully', () => {
    expect(() => calcSubtotal(null)).toThrow();
  });

  /* ---- DB edge cases ---- */
  it('db: getById returns null for missing', async () => {
    expect(await db.getById('tables', 'nonexistent')).toBeNull();
  });
  it('db: getAll returns [] on empty store', async () => {
    await db.clearStore('tables');
    expect(await db.getAll('tables')).toEqual([]);
  });
  it('db: putMany with empty array returns []', async () => {
    expect(await db.putMany('menu_items', [])).toEqual([]);
  });
  it('db: getMeta for missing key returns null', async () => {
    expect(await db.getMeta('no_such_key')).toBeNull();
  });
});
