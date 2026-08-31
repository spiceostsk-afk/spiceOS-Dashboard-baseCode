/**
 * One login, several restaurants.
 *
 * The tenant lives in a JWT claim, so switching is a re-mint plus a reload —
 * there is no half-switched state to test. What is worth guarding is the part
 * a user can actually get wrong: showing the switcher when it is meaningless,
 * losing track of which restaurant is active, or letting someone "switch" to
 * the one they are already in and sit through a pointless page reload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

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
    auth: { refreshSession: vi.fn(() => Promise.resolve({ error: null })) },
  },
  isMockMode: true,
}));

vi.mock('../context/OutletContext', () => ({
  useOutlet: () => ({
    outlets: [], outlet: { id: 'o1', name: 'Main Kitchen' }, outletId: 'o1',
    loading: false, selectOutlet: vi.fn(), addOutlet: vi.fn(),
    refresh: vi.fn(), isMultiOutlet: false,
  }),
  OutletProvider: ({ children }) => children,
}));

const THREE = [
  { id: 'r1', name: 'Baba Foods Bandra', slug: 'baba-bandra', role: 'owner', status: 'active', is_active: true },
  { id: 'r2', name: 'Baba Foods Andheri', slug: 'baba-andheri', role: 'owner', status: 'active', is_active: false },
  { id: 'r3', name: 'Baba Foods Powai', slug: 'baba-powai', role: 'owner', status: 'suspended', is_active: false },
];

let auth;

vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }) => children,
}));

const authStub = (over = {}) => ({
  session: { user: { email: 'owner@example.com' } },
  user: { email: 'owner@example.com' },
  restaurantId: 'r1',
  role: 'owner',
  isPlatformAdmin: false,
  loading: false,
  restaurants: THREE,
  restaurantsLoading: false,
  switching: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
  switchRestaurant: vi.fn(() => Promise.resolve({ success: true })),
  createRestaurant: vi.fn(() => Promise.resolve({ success: true, id: 'r4' })),
  refreshRestaurants: vi.fn(),
  ...over,
});

import Header from '../components/Header';

const renderHeader = () =>
  render(<MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter>);

describe('Restaurant switcher', () => {
  beforeEach(() => { auth = authStub(); });

  it('names the restaurant currently in the JWT', () => {
    renderHeader();
    expect(screen.getByText('Baba Foods Bandra')).toBeInTheDocument();
  });

  it('stays hidden for an owner with a single restaurant', () => {
    auth = authStub({ restaurants: [THREE[0]] });
    renderHeader();
    expect(screen.queryByText('Baba Foods Bandra')).not.toBeInTheDocument();
  });

  it('stays hidden before the restaurant list has loaded', () => {
    auth = authStub({ restaurants: [] });
    renderHeader();
    expect(screen.queryByText(/Your restaurants/i)).not.toBeInTheDocument();
  });

  it('lists every restaurant on the login', () => {
    renderHeader();
    fireEvent.click(screen.getByText('Baba Foods Bandra'));
    const pop = screen.getByText('Your restaurants').closest('.pop');
    expect(within(pop).getByText('Baba Foods Andheri')).toBeInTheDocument();
    expect(within(pop).getByText(/Baba Foods Powai/)).toBeInTheDocument();
  });

  it('switches to the restaurant that was picked', () => {
    renderHeader();
    fireEvent.click(screen.getByText('Baba Foods Bandra'));
    fireEvent.click(screen.getByText('Baba Foods Andheri'));
    expect(auth.switchRestaurant).toHaveBeenCalledWith('r2');
  });

  it('does not reload the app to switch to the restaurant already open', () => {
    renderHeader();
    fireEvent.click(screen.getByText('Baba Foods Bandra'));
    const pop = screen.getByText('Your restaurants').closest('.pop');
    const current = within(pop).getAllByRole('button')
      .find((b) => b.textContent.includes('Baba Foods Bandra'));
    expect(current).toBeDisabled();
  });

  it('surfaces a restaurant that is not currently usable', () => {
    renderHeader();
    fireEvent.click(screen.getByText('Baba Foods Bandra'));
    expect(screen.getByText(/suspended/)).toBeInTheDocument();
  });

  it('shows progress while the token is being re-minted', () => {
    auth = authStub({ switching: true });
    renderHeader();
    expect(screen.getByText('Switching…')).toBeInTheDocument();
  });
});

describe('Adding a restaurant', () => {
  beforeEach(() => { auth = authStub(); });

  const openModal = () => {
    renderHeader();
    fireEvent.click(screen.getByText('Baba Foods Bandra'));
    fireEvent.click(screen.getByText('Add restaurant'));
  };

  it('opens from the switcher', () => {
    openModal();
    expect(screen.getByText('Restaurant name')).toBeInTheDocument();
  });

  it('derives the public address from the name', () => {
    openModal();
    fireEvent.change(screen.getByPlaceholderText(/Baba Foods Andheri/i), {
      target: { value: 'Baba Foods  Juhu!' },
    });
    expect(screen.getByDisplayValue('baba-foods-juhu')).toBeInTheDocument();
  });

  it('lets the owner override the derived address', () => {
    openModal();
    fireEvent.change(screen.getByPlaceholderText(/Baba Foods Andheri/i), {
      target: { value: 'Baba Foods Juhu' },
    });
    fireEvent.change(screen.getByPlaceholderText('baba-foods-andheri'), {
      target: { value: 'juhu-branch' },
    });
    expect(screen.getByDisplayValue('juhu-branch')).toBeInTheDocument();
  });

  it('will not submit without a name', () => {
    openModal();
    expect(screen.getByRole('button', { name: /Create restaurant/i })).toBeDisabled();
  });

  it('creates, then moves the owner into the new restaurant', async () => {
    openModal();
    fireEvent.change(screen.getByPlaceholderText(/Baba Foods Andheri/i), {
      target: { value: 'Baba Foods Juhu' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create restaurant/i }));

    await vi.waitFor(() => expect(auth.createRestaurant).toHaveBeenCalled());
    expect(auth.createRestaurant).toHaveBeenCalledWith('Baba Foods Juhu', 'baba-foods-juhu');
    await vi.waitFor(() => expect(auth.switchRestaurant).toHaveBeenCalledWith('r4'));
  });

  it('reports a rejected name instead of closing silently', async () => {
    auth = authStub({
      createRestaurant: vi.fn(() => Promise.resolve({ success: false, error: 'The address "x" is already taken' })),
    });
    openModal();
    fireEvent.change(screen.getByPlaceholderText(/Baba Foods Andheri/i), {
      target: { value: 'Baba Foods Juhu' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create restaurant/i }));

    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
    expect(auth.switchRestaurant).not.toHaveBeenCalled();
  });
});
