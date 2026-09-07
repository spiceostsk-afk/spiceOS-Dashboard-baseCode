/**
 * Order History, and the owner corrections inside it.
 *
 * This screen white-screened for owners. Four icons used only in the owner
 * block — ShieldCheck, Pencil, Ban, Trash2 — were never imported, so expanding
 * a row rendered <undefined /> and took the page down. It only happened for an
 * owner, because that block is the only thing that renders them, which is why
 * it read as "edit and delete are missing" rather than as a crash.
 *
 * The rest of the flow was scaffolded and never finished: openAdmin set a
 * target and nothing rendered a dialog, so the buttons looked live and did
 * nothing.
 *
 * The first test here is the one that matters — it renders an expanded row as
 * an owner, which is exactly what used to throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

let mockOrders;
let mockAdmin;

vi.mock('../hooks/useOrdersData', () => ({ useOrdersData: () => mockOrders }));
vi.mock('../hooks/useOrderAdmin', () => ({ useOrderAdmin: () => mockAdmin }));

import Orders from '../views/Orders';

const session = (over = {}) => ({
  id: 's1',
  billId: '1DE4',
  customerName: 'SWIGGY',
  tableNumber: '4',
  guests: 2,
  itemCount: 2,
  totalAmount: 7227,
  status: 'completed',
  startedAt: '2026-09-02T11:00:00Z',
  endedAt: '2026-09-02T11:24:00Z',
  orders: [{
    id: 'o1',
    subtotal: 7227,
    tax: 0,
    total: 7227,
    created_at: '2026-09-02T11:05:00Z',
    order_status: 'completed',
    order_items: [
      { id: 'oi1', quantity: 2, item_price: 200, total_price: 400, menu_item_id: 'm1', menu_items: { item_name: 'Chicken Biryani' } },
    ],
  }],
  ...over,
});

// The row expands off selectedOrder, which lives in the hook — so an expanded
// row is set up here rather than clicked into existence.
const stub = (rows, expanded = false) => ({
  orders: rows,
  loading: false,
  error: null,
  search: '',
  setSearch: vi.fn(),
  statusFilter: 'all',
  setStatusFilter: vi.fn(),
  dateRange: 'all',
  setDateRange: vi.fn(),
  selectedOrder: expanded ? rows[0] : null,
  setSelectedOrder: vi.fn(),
  refetch: vi.fn(),
  formatCurrency: (n) => `₹${Number(n || 0).toFixed(2)}`,
  STATUS_FILTERS: ['all', 'completed', 'void'],
  handlePrintKot: vi.fn(),
});

describe('Order History', () => {
  beforeEach(() => {
    mockOrders = stub([session()], true);
    mockAdmin = {
      canAdminister: true,
      busy: false,
      voidOrder: vi.fn(async () => ({ success: true })),
      editOrder: vi.fn(async () => ({ success: true })),
      deleteOrder: vi.fn(async () => ({ success: true })),
    };
  });

  // "Void" is also a status filter chip, so the corrections are always
  // queried inside their own block rather than across the page.
  const ownerActions = () => within(screen.getByText('Owner actions').closest('.oh-admin'));

  it('expands a row for an owner without crashing', () => {
    render(<Orders />);

    // The block whose icons were missing.
    expect(screen.getByText('Owner actions')).toBeInTheDocument();
    expect(ownerActions().getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(ownerActions().getByRole('button', { name: /void/i })).toBeInTheDocument();
    expect(ownerActions().getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
  });

  it('expands a row for a non-owner without offering corrections', () => {
    mockAdmin = { ...mockAdmin, canAdminister: false };
    render(<Orders />);

    expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    expect(screen.queryByText('Owner actions')).not.toBeInTheDocument();
  });

  it('opens the delete dialog and asks for no reason', async () => {
    render(<Orders />);
    fireEvent.click(ownerActions().getByRole('button', { name: /delete/i }));

    expect(await screen.findByText('Delete this bill')).toBeInTheDocument();
    // Voiding explains itself; a deleted bill has nothing left to annotate.
    expect(screen.queryByPlaceholderText(/duplicate of bill/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    await waitFor(() => expect(mockAdmin.deleteOrder).toHaveBeenCalledWith('o1', ''));
  });

  it('still requires a reason to void', async () => {
    render(<Orders />);
    fireEvent.click(ownerActions().getByRole('button', { name: /void/i }));

    const dialog = await screen.findByText(/void this bill/i);
    const modal = within(dialog.closest('form') || dialog.closest('.modal'));

    // Nothing typed, so voiding must stay unavailable — a struck-through bill
    // still has to say why.
    expect(modal.getByRole('button', { name: /^void bill|^void$/i })).toBeDisabled();
    expect(mockAdmin.voidOrder).not.toHaveBeenCalled();
  });
});
