import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

describe('Sidebar', () => {
  it('renders all primary navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Menu Catalog')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('QR Management')).toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Order History')).toBeInTheDocument();
  });

  it('renders brand logo', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('SPICE OS')).toBeInTheDocument();
    expect(screen.getByText('POINT OF SALE')).toBeInTheDocument();
  });

  it('renders Daily Operations group', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('Daily Operations')).toBeInTheDocument();
    expect(screen.getByText('Live Orders')).toBeInTheDocument();
    expect(screen.getByText('Online Orders')).toBeInTheDocument();
    expect(screen.getByText('Store Actions')).toBeInTheDocument();
  });
});

describe('Header', () => {
  it('renders correct title for dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('POS Dashboard')).toBeInTheDocument();
  });

  it('renders correct title for orders page', () => {
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Order History')).toBeInTheDocument();
  });

  it('renders shift badge', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Shift Active')).toBeInTheDocument();
  });
});
