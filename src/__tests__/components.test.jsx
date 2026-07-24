import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DollarSign } from 'lucide-react';

import StatCard from '../components/dashboard/StatCard';
import ConnectivityBanner from '../components/billing/ConnectivityBanner';

describe('StatCard', () => {
  it('renders with title and value', () => {
    render(<StatCard title="Revenue" value="$1,234" icon={DollarSign} accentColor="#2E7D32" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$1,234')).toBeInTheDocument();
  });

  it('shows loading state when loading is true', () => {
    const { container } = render(<StatCard title="Revenue" value="" loading={true} icon={DollarSign} accentColor="#2E7D32" />);
    expect(container.querySelector('.spinner')).toBeTruthy();
  });

  it('shows em dash when value is null', () => {
    render(<StatCard title="Revenue" value={null} icon={DollarSign} accentColor="#2E7D32" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows subtitle when provided', () => {
    render(<StatCard title="Revenue" value="$1,234" subtitle="+12% vs yesterday" icon={DollarSign} accentColor="#2E7D32" />);
    expect(screen.getByText('+12% vs yesterday')).toBeInTheDocument();
  });
});

describe('ConnectivityBanner', () => {
  it('renders offline state', () => {
    render(<ConnectivityBanner isOnline={false} syncing={false} syncProgress={{ current: 0, total: 0 }} lastSyncResult={null} syncNow={() => {}} />);
    expect(screen.getByText(/Offline Mode/)).toBeInTheDocument();
  });

  it('renders syncing state', () => {
    render(<ConnectivityBanner isOnline={true} syncing={true} syncProgress={{ current: 3, total: 5 }} lastSyncResult={null} syncNow={() => {}} />);
    expect(screen.getByText(/Syncing data/)).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });

  it('renders synced state with item count', () => {
    render(<ConnectivityBanner isOnline={true} syncing={false} syncProgress={{ current: 0, total: 0 }} lastSyncResult={{ synced: 3, failed: 0 }} syncNow={() => {}} />);
    expect(screen.getByText(/Synced 3 items/)).toBeInTheDocument();
  });

  it('renders single item synced correctly', () => {
    render(<ConnectivityBanner isOnline={true} syncing={false} syncProgress={{ current: 0, total: 0 }} lastSyncResult={{ synced: 1, failed: 0 }} syncNow={() => {}} />);
    expect(screen.getByText(/Synced 1 item/)).toBeInTheDocument();
  });

  it('shows failed count when present', () => {
    render(<ConnectivityBanner isOnline={true} syncing={false} syncProgress={{ current: 0, total: 0 }} lastSyncResult={{ synced: 2, failed: 1 }} syncNow={() => {}} />);
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('returns null when online and no sync result', () => {
    const { container } = render(<ConnectivityBanner isOnline={true} syncing={false} syncProgress={{ current: 0, total: 0 }} lastSyncResult={null} syncNow={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
