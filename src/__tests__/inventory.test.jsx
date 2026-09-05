/**
 * The inventory & stock-control module.
 *
 * The arithmetic here is the part worth guarding: a wrong conversion factor or
 * an inverted variance does not throw, it just quietly reports the wrong
 * number of kilos, and nobody notices until a stock take disagrees with the
 * books by a week's worth of paneer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

/* ---- Supabase: every call resolves empty; rpc resolves to a null payload ---- */
const emptyResult = { data: [], error: null, count: 0 };

function queryStub() {
  const chain = {};
  ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'gte', 'lte',
    'order', 'limit', 'single', 'maybeSingle'].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.then = (resolve) => Promise.resolve(emptyResult).then(resolve);
  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => queryStub()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
  isMockMode: true,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ restaurantId: 'r1', user: null, session: null, isPlatformAdmin: false }),
  AuthProvider: ({ children }) => children,
}));

const OUTLETS = [
  { id: 'o1', name: 'Main Kitchen', is_default: true },
  { id: 'o2', name: 'Andheri Branch', is_default: false },
];

vi.mock('../context/OutletContext', () => ({
  useOutlet: () => ({
    outlets: OUTLETS,
    outlet: OUTLETS[0],
    outletId: 'o1',
    loading: false,
    selectOutlet: vi.fn(),
    addOutlet: vi.fn(),
    refresh: vi.fn(),
    isMultiOutlet: true,
  }),
  OutletProvider: ({ children }) => children,
}));

import { lineTotals } from '../hooks/usePurchaseData';

/* ============================================================ purchase math */
describe('Purchase line arithmetic', () => {
  const sack = { unit: 'Kg', purchase_unit: 'Sack', conversion_factor: 25 };
  const loose = { unit: 'Kg', purchase_unit: 'Kg', conversion_factor: 1 };

  it('converts a purchase-unit quantity into base units for stock', () => {
    // 2 sacks of 25 Kg is 50 Kg on the shelf, whatever the invoice says.
    const { qtyBase } = lineTotals({ qty: 2, rate: 1200, entryUnit: 'purchase' }, sack);
    expect(qtyBase).toBe(50);
  });

  it('leaves a base-unit quantity alone', () => {
    const { qtyBase } = lineTotals({ qty: 7.5, rate: 60, entryUnit: 'base' }, loose);
    expect(qtyBase).toBe(7.5);
  });

  it('prices the line off the entry unit, not the base unit', () => {
    // ₹1200 per sack x 2 = ₹2400 — NOT ₹1200 x 50 Kg.
    const { amount } = lineTotals({ qty: 2, rate: 1200, entryUnit: 'purchase' }, sack);
    expect(amount).toBe(2400);
  });

  it('applies tax on top of the line value', () => {
    const { amount } = lineTotals({ qty: 10, rate: 100, taxPct: 5, entryUnit: 'base' }, loose);
    expect(amount).toBe(1050);
  });

  it('treats a missing item as a 1:1 conversion rather than throwing', () => {
    const { qtyBase, amount } = lineTotals({ qty: 3, rate: 10, entryUnit: 'purchase' }, undefined);
    expect(qtyBase).toBe(3);
    expect(amount).toBe(30);
  });

  it('rounds away float dust from repeated conversion', () => {
    const odd = { unit: 'Kg', purchase_unit: 'Box', conversion_factor: 0.1 };
    const { qtyBase } = lineTotals({ qty: 3, rate: 0, entryUnit: 'purchase' }, odd);
    expect(qtyBase).toBe(0.3);
  });
});

/* ====================================================== count sheet display */
const makeRow = (over = {}) => ({
  lineId: 'l1', itemId: 'i1', name: 'Paneer', unit: 'Kg', purchaseUnit: 'Kg',
  conversion: 1, categoryId: 'c1', favourite: false, barcode: '',
  ideal: 10, physical: null, entered: null, enteredUnit: 'base',
  physicalPreview: null, remarkDraft: '', variancePreview: null,
  hasEntry: false, rate: 100, remark: '',
  ...over,
});

const sheetStub = (over = {}) => ({
  countId: 'sc1', status: 'draft', rows: [], categories: [{ id: 'c1', name: 'Dairy' }],
  date: '2026-08-31', setDate: vi.fn(), cycle: 'daily', setCycle: vi.fn(),
  loading: false, saving: false, error: null, enteredCount: 0,
  setEntry: vi.fn(), clearEntry: vi.fn(), clearAll: vi.fn(),
  saveDraft: vi.fn(), submit: vi.fn(), resetSheet: vi.fn(), toggleFavourite: vi.fn(),
  refresh: vi.fn(), isSubmitted: false,
  ...over,
});

let mockSheet = sheetStub();

vi.mock('../hooks/useStockCount', () => ({
  useStockCount: () => mockSheet,
  useStockCountHistory: () => ({ history: [], loading: false, refresh: vi.fn() }),
}));

import ClosingStock from '../views/inventory/ClosingStock';
import AvailableStock from '../views/inventory/AvailableStock';

describe('Closing stock sheet', () => {
  beforeEach(() => { mockSheet = sheetStub(); });

  it('labels the system figure "Closing Stock" in closing mode', () => {
    mockSheet = sheetStub({ rows: [makeRow()] });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    expect(screen.getAllByText('Closing Stock').length).toBeGreaterThan(0);
  });

  it('labels the same column "Current" in available mode', () => {
    mockSheet = sheetStub({ rows: [makeRow()] });
    render(<MemoryRouter><AvailableStock /></MemoryRouter>);
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Available Stock')).toBeInTheDocument();
  });

  it('shows a shortfall as a negative variance', () => {
    mockSheet = sheetStub({
      enteredCount: 1,
      rows: [makeRow({
        ideal: 10, physicalPreview: 8, variancePreview: -2, hasEntry: true, entered: 8,
      })],
    });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    expect(screen.getByText('-2 Kg')).toBeInTheDocument();
  });

  it('shows a surplus with an explicit plus sign', () => {
    mockSheet = sheetStub({
      enteredCount: 1,
      rows: [makeRow({ ideal: 10, physicalPreview: 12, variancePreview: 2, hasEntry: true, entered: 12 })],
    });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    expect(screen.getByText('+2 Kg')).toBeInTheDocument();
  });

  it('calls a zero variance a match rather than showing "0"', () => {
    mockSheet = sheetStub({
      enteredCount: 1,
      rows: [makeRow({ ideal: 10, physicalPreview: 10, variancePreview: 0, hasEntry: true, entered: 10 })],
    });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    expect(screen.getByText('Match')).toBeInTheDocument();
  });

  it('offers a remark box only where there is a variance to explain', () => {
    mockSheet = sheetStub({
      enteredCount: 2,
      rows: [
        makeRow({ itemId: 'i1', name: 'Paneer', variancePreview: -2, hasEntry: true, entered: 8, physicalPreview: 8 }),
        makeRow({ itemId: 'i2', lineId: 'l2', name: 'Ghee', variancePreview: 0, hasEntry: true, entered: 10, physicalPreview: 10 }),
      ],
    });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    expect(screen.getByLabelText('Remark for Paneer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Remark for Ghee')).not.toBeInTheDocument();
  });

  it('will not let an empty sheet be reviewed', () => {
    mockSheet = sheetStub({ rows: [makeRow()], enteredCount: 0 });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Review/i })).toBeDisabled();
  });

  it('opens the review step once something has been counted', () => {
    mockSheet = sheetStub({
      enteredCount: 1,
      rows: [makeRow({ variancePreview: -2, hasEntry: true, entered: 8, physicalPreview: 8 })],
    });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Review/i }));
    expect(screen.getByText('Review closing stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm & post/i })).toBeEnabled();
  });

  it('reports progress against the full item list', () => {
    mockSheet = sheetStub({
      enteredCount: 1,
      rows: [
        makeRow({ hasEntry: true, entered: 8, physicalPreview: 8, variancePreview: -2 }),
        makeRow({ itemId: 'i2', lineId: 'l2', name: 'Ghee' }),
      ],
    });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    expect(screen.getByText('1 of 2 counted')).toBeInTheDocument();
  });

  // A posted sheet is not a dead end. Counting again is closed off, but the
  // day can still be looked at, corrected or removed from right here.
  it('offers edit, delete and export on a sheet already posted', () => {
    mockSheet = sheetStub({ status: 'submitted', isSubmitted: true, rows: [makeRow()] });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);

    expect(screen.getByText(/posted for/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit this count/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export this day/i })).toBeInTheDocument();

    // Entering fresh counts stays closed off until it is reopened.
    expect(screen.queryByRole('button', { name: /Review/i })).not.toBeInTheDocument();
  });

  it('filters the sheet down to a search term', () => {
    mockSheet = sheetStub({
      rows: [
        makeRow({ itemId: 'i1', name: 'Paneer' }),
        makeRow({ itemId: 'i2', lineId: 'l2', name: 'Ghee' }),
      ],
    });
    render(<MemoryRouter><ClosingStock /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/Search raw material/i), {
      target: { value: 'ghee' },
    });
    expect(screen.getByText('Ghee')).toBeInTheDocument();
    expect(screen.queryByText('Paneer')).not.toBeInTheDocument();
  });
});

/* ======================================================== stock summary */
const summaryRow = (over = {}) => ({
  inventory_item_id: 'i1', item_name: 'Paneer', category_id: 'c1',
  category_name: 'Dairy', unit: 'Kg',
  opening_stock: 10, purchase_stock: 20, total_stock: 30, consumption: 12,
  transfer_in: 0, transfer_out: 3, wastage: 1, shortage: 0, production: 0,
  adjustment: 0, ideal_stock: 14, physical_stock: 13, variance: -1,
  closing_stock: 13, remark: 'Fridge failure', rate: 100, ideal_value: 1400,
  ...over,
});

let mockSummary;

vi.mock('../hooks/useStockSummary', () => ({
  useStockSummary: () => mockSummary,
}));

import StockSummary from '../views/inventory/StockSummary';

const summaryStub = (rows = []) => ({
  rows,
  categories: [{ id: 'c1', name: 'Dairy' }],
  filters: { from: '2026-08-01', to: '2026-08-31', categoryId: '', search: '', unitType: 'base', allOutlets: false },
  totals: { items: rows.length, purchase: 20, consumption: 12, wastage: 1, value: 1400, counted: 1, mismatched: 1, varianceValue: -100 },
  loading: false, error: null,
  setFilter: vi.fn(), search: vi.fn(), clear: vi.fn(), exportCsv: vi.fn(),
});

describe('Stock Summary report', () => {
  beforeEach(() => { mockSummary = summaryStub([summaryRow()]); });

  it('renders every column the client asked for', () => {
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    ['Opening', 'Purchase', 'Consumption', 'Wastage', 'Variance', 'Remark']
      .forEach((label) => {
        expect(screen.getAllByText(new RegExp(label, 'i')).length).toBeGreaterThan(0);
      });
  });

  it('shows the counted figure alongside the expected one', () => {
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    expect(screen.getByText('14')).toBeInTheDocument();   // ideal
    expect(screen.getByText('-1')).toBeInTheDocument();   // variance
    // Physical and closing are both 13, and that is the point: once a count is
    // taken, what carries into tomorrow is the counted figure, not the ideal.
    expect(screen.getAllByText('13')).toHaveLength(2);    // physical + closing
  });

  it('shows what actually carries into the next day', () => {
    // Ideal deliberately excludes the count correction; closing includes it.
    // When the two differ, a count is the reason — and the report has to show
    // the number the next day will open at, not only the one the books expected.
    mockSummary = summaryStub([summaryRow({ ideal_stock: 14, physical_stock: 9, closing_stock: 9 })]);
    render(<MemoryRouter><StockSummary /></MemoryRouter>);

    expect(screen.getAllByText(/Closing/i).length).toBeGreaterThan(0);
    expect(screen.getByText('14')).toBeInTheDocument();   // ideal, before the count
    expect(screen.getAllByText('9')).toHaveLength(2);     // physical, and what carries
  });

  it('carries the operator’s remark through to the report', () => {
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    expect(screen.getByText('Fridge failure')).toBeInTheDocument();
  });

  it('says so plainly when an item was never counted', () => {
    mockSummary = summaryStub([summaryRow({ physical_stock: null, variance: null, remark: null })]);
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    expect(screen.getByText('Not counted')).toBeInTheDocument();
  });

  it('marks an item that matched its expected stock', () => {
    mockSummary = summaryStub([summaryRow({ physical_stock: 14, variance: 0 })]);
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    expect(screen.getByText('Match')).toBeInTheDocument();
  });

  it('shows an empty state rather than a bare table', () => {
    mockSummary = summaryStub([]);
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    expect(screen.getByText('No stock movement in this range')).toBeInTheDocument();
  });

  it('disables export when there is nothing to export', () => {
    mockSummary = summaryStub([]);
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeDisabled();
  });

  it('exports on demand', () => {
    render(<MemoryRouter><StockSummary /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    expect(mockSummary.exportCsv).toHaveBeenCalled();
  });
});

/* ============================================================ render smoke */
import Purchase from '../views/inventory/Purchase';
import Wastage from '../views/inventory/Wastage';
import Transfer from '../views/inventory/Transfer';
import Vendors from '../views/inventory/Vendors';

describe('Inventory module render smoke tests', () => {
  beforeEach(() => {
    mockSheet = sheetStub();
    mockSummary = summaryStub([]);
  });

  [
    ['Purchase', Purchase],
    ['Wastage', Wastage],
    ['Transfer', Transfer],
    ['Vendors', Vendors],
    ['Closing Stock', ClosingStock],
    ['Available Stock', AvailableStock],
    ['Stock Summary', StockSummary],
  ].forEach(([name, View]) => {
    it(`${name} renders without crashing`, () => {
      const { container } = render(<MemoryRouter><View /></MemoryRouter>);
      expect(container.firstChild).toBeTruthy();
    });
  });

  // Transfers used to demand two real outlets, which made the screen useless
  // for a single-outlet restaurant. FROM and TO are free text now, so it has
  // to work with one outlet — the stock simply leaves and does not arrive.
  it('Transfer is usable on a single-outlet account', async () => {
    const mod = await import('../context/OutletContext');
    const spy = vi.spyOn(mod, 'useOutlet').mockReturnValue({
      outlets: [OUTLETS[0]], outlet: OUTLETS[0], outletId: 'o1', loading: false,
      selectOutlet: vi.fn(), addOutlet: vi.fn(), refresh: vi.fn(), isMultiOutlet: false,
    });
    render(<MemoryRouter><Transfer /></MemoryRouter>);

    expect(screen.queryByText('Only one outlet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New transfer/i })).toBeEnabled();
    expect(screen.getByText(/Stock leaving Main Kitchen/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
