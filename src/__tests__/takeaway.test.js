import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { expandTakeawayRows, pickTakeawayCounter, tokenOf } from '../lib/takeaway';

const isOpen = (s) => s.session_status === 'active' || s.session_status === 'billing';
const isHeld = (s) => s.session_status === 'hold';
const ta = (id, token, status = 'active') => ({
  id, session_status: status, metadata: { order_type: 'takeaway', token },
});

describe('expandTakeawayRows', () => {
  const g1 = { id: 'g1', kind: 'table', table_number: 'G1', status: 'occupied', customer_sessions: [] };
  const p2 = { id: 'p2', kind: 'packing', table_number: 'P2', status: 'available', customer_sessions: [] };
  const p1 = {
    id: 'p1', kind: 'packing', table_number: 'P1', status: 'available',
    customer_sessions: [ta('s1', 1), ta('s2', 2), ta('s3', 3, 'hold'), ta('s0', 0, 'completed')],
  };

  const rows = expandTakeawayRows([g1, p2, p1], { isOpen, isHeld });

  it('keeps a dine-in table as one row', () => {
    expect(rows.filter((r) => r.id === 'g1')).toHaveLength(1);
  });

  it('gives every open takeaway its own row, all on one counter', () => {
    const open = rows.filter((r) => r.active_session);
    expect(open.map((r) => r.active_session.id)).toEqual(['s1', 's2']);
    expect(new Set(open.map((r) => r.rowKey)).size).toBe(2);
  });

  it('lists a held takeaway as held, not open', () => {
    const held = rows.filter((r) => r.held_session);
    expect(held.map((r) => r.held_session.id)).toEqual(['s3']);
    expect(held[0].active_session).toBeNull();
  });

  it('shows one "New takeaway" row, on the lowest counter, and no bare counters', () => {
    const fresh = rows.filter((r) => r.isNewTakeaway);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).toBe('p1');
    expect(rows.filter((r) => r.kind === 'packing' && !r.isNewTakeaway && !r.active_session && !r.held_session))
      .toHaveLength(0);
  });

  it('files new takeaways under the lowest counter, whatever its status', () => {
    expect(pickTakeawayCounter(rows).id).toBe('p1');
    expect(pickTakeawayCounter([g1])).toBeNull();
  });
});

describe('tokenOf', () => {
  it('reads a takeaway token and ignores dine-in sessions', () => {
    expect(tokenOf(ta('x', 7))).toBe(7);
    expect(tokenOf({ metadata: {} })).toBeNull();
    expect(tokenOf(null)).toBeNull();
  });
});
