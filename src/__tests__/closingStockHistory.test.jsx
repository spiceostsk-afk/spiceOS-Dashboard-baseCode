/**
 * The Closing Stock history list.
 *
 * Its own file because the module mock below is file-wide, and the count
 * workspace in inventory.test.jsx needs the real thing.
 *
 * Two faults met here and cost a week of counts. The only route back into a
 * sheet was disabled unless it had already been posted, so a half-finished
 * count had no way back; and a draft's variance — a snapshot from whenever it
 * was typed, measured against a ledger that has since moved — was displayed as
 * though it were a finding. Three filled sheets sat untouched, one of them a
 * 199-line count of 31 August, correcting nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

let mockHistory;
let mockDocs;

vi.mock('../hooks/useStockDocuments', () => ({
  useStockCountHistoryDetail: () => mockHistory,
  useStockDocuments: () => mockDocs,
}));

import ClosingStockHistory from '../views/inventory/ClosingStockHistory';

const countRow = (over = {}) => ({
  id: 'k1',
  date: '2026-08-31',
  cycle: 'Daily',
  status: 'draft',
  submittedAt: null,
  note: null,
  lines: [{
    id: 'l1', name: 'Rumali Roti', unit: 'Piece',
    ideal: 5, physical: 0, variance: -5, remark: '', rate: 4,
  }],
  counted: 199,
  mismatched: 66,
  varianceValue: -264,
  ...over,
});

describe('Closing stock history', () => {
  beforeEach(() => {
    mockDocs = {
      busy: false,
      reopenCount: vi.fn(async () => ({ success: true })),
      deleteDocument: vi.fn(),
    };
    mockHistory = { counts: [countRow()], loading: false, error: null, refresh: vi.fn() };
  });

  it('lets an unposted sheet be opened again', async () => {
    const onEdit = vi.fn();
    render(<ClosingStockHistory type="closing" onEdit={onEdit} />);

    const edit = screen.getByTitle('Carry on filling in this sheet');
    expect(edit).not.toBeDisabled();

    fireEvent.click(edit);
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('2026-08-31'));

    // A draft has posted nothing, so there is no correction to take back.
    expect(mockDocs.reopenCount).not.toHaveBeenCalled();
  });

  it('undoes the correction first when the sheet was posted', async () => {
    const onEdit = vi.fn();
    mockHistory = { ...mockHistory, counts: [countRow({ status: 'submitted' })] };
    render(<ClosingStockHistory type="closing" onEdit={onEdit} />);

    fireEvent.click(screen.getByTitle(/undoes this count/i));

    await waitFor(() => expect(mockDocs.reopenCount).toHaveBeenCalledWith('k1'));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('2026-08-31'));
  });

  it('does not present a draft’s stale variance as a finding', () => {
    render(<ClosingStockHistory type="closing" onEdit={vi.fn()} />);

    expect(screen.getByText('Not posted yet')).toBeInTheDocument();
    expect(screen.queryByText('66')).not.toBeInTheDocument();
    expect(screen.queryByText(/264/)).not.toBeInTheDocument();
  });

  it('says plainly that a filled draft has changed nothing', () => {
    render(<ClosingStockHistory type="closing" onEdit={vi.fn()} />);
    expect(screen.getByText('199 counted, none applied')).toBeInTheDocument();
  });

  it('shows the real variance once the sheet is posted', () => {
    mockHistory = { ...mockHistory, counts: [countRow({ status: 'submitted' })] };
    render(<ClosingStockHistory type="closing" onEdit={vi.fn()} />);

    expect(screen.getByText('66')).toBeInTheDocument();
    expect(screen.queryByText('Not posted yet')).not.toBeInTheDocument();
  });

  it('does not nag about an empty draft', () => {
    mockHistory = { ...mockHistory, counts: [countRow({ counted: 0, mismatched: 0 })] };
    render(<ClosingStockHistory type="closing" onEdit={vi.fn()} />);
    expect(screen.queryByText(/none applied/)).not.toBeInTheDocument();
  });
});
