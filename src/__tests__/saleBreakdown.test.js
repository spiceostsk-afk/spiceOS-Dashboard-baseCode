/**
 * The dashboard's sale bifurcation.
 *
 * This is money on a screen a manager reconciles against a cash drawer, so the
 * things worth pinning down are the ones that would make it quietly wrong: an
 * unpaid bill counting, a cancelled line counting, two spellings of UPI landing
 * in different rows, and shares that do not add up to the whole.
 */
import { describe, it, expect } from 'vitest';
import { buildChannelSplit, buildItemSplit } from '../hooks/useDashboardData';

const bill = (method, total, status = 'paid') => ({
  payment_method: method, grand_total: total, payment_status: status,
});

const line = (name, qty, price, extra = {}) => ({
  quantity: qty,
  item_price: price,
  total_price: qty * price,
  menu_items: { item_name: name, menu_categories: { category_name: 'Mains' } },
  ...extra,
});

describe('Payment-mode split', () => {
  it('leaves an unpaid bill out of the takings', () => {
    const { rows, paidTotal } = buildChannelSplit([
      bill('cash', 500), bill('cash', 300, 'pending'),
    ]);
    expect(paidTotal).toBe(500);
    expect(rows[0].bills).toBe(1);
  });

  it('folds qr and upi into one UPI row', () => {
    const { rows } = buildChannelSplit([bill('upi', 200), bill('qr', 300)]);
    const upi = rows.filter((r) => r.label === 'UPI');
    expect(upi).toHaveLength(1);
    expect(upi[0].amount).toBe(500);
    expect(upi[0].bills).toBe(2);
  });

  it('keeps the aggregators as their own modes', () => {
    const { rows } = buildChannelSplit([bill('zomato', 400), bill('swiggy', 600)]);
    expect(rows.map((r) => r.label)).toEqual(['Zomato', 'Swiggy']);
  });

  it('files an unrecognised mode under Other rather than dropping the money', () => {
    const { rows, paidTotal } = buildChannelSplit([bill('cheque', 250)]);
    expect(rows[0].label).toBe('Other');
    expect(paidTotal).toBe(250);
  });

  it('orders the rows the way the report is read, not by size', () => {
    const { rows } = buildChannelSplit([
      bill('card', 900), bill('zomato', 100), bill('cash', 500),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Zomato', 'Cash', 'Card']);
  });

  it('gives shares that add up to the whole', () => {
    const { rows } = buildChannelSplit([
      bill('cash', 250), bill('card', 250), bill('upi', 500),
    ]);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 5);
  });

  it('reports nothing rather than dividing by zero on an empty day', () => {
    expect(buildChannelSplit([])).toEqual({ rows: [], paidTotal: 0 });
    expect(buildChannelSplit(null).paidTotal).toBe(0);
  });
});

describe('Item-wise split', () => {
  it('adds the same dish across separate orders together', () => {
    const { rows, total } = buildItemSplit([
      line('Dal Makhani', 2, 240), line('Dal Makhani', 1, 240),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(3);
    expect(total).toBe(720);
  });

  it('earns nothing from a cancelled line', () => {
    const { rows, total } = buildItemSplit([
      line('Dal Makhani', 1, 240), line('Naan', 4, 60, { is_cancelled: true }),
    ]);
    expect(rows).toHaveLength(1);
    expect(total).toBe(240);
  });

  it('falls back to price times quantity when the line total is missing', () => {
    const { total } = buildItemSplit([{ quantity: 2, item_price: 150, total_price: null }]);
    expect(total).toBe(300);
  });

  it('names a deleted dish rather than showing a blank row', () => {
    const { rows } = buildItemSplit([{ quantity: 1, item_price: 100, total_price: 100 }]);
    expect(rows[0].name).toBe('(deleted dish)');
    expect(rows[0].category).toBe('Uncategorised');
  });

  it('ranks by revenue, not by how many were sold', () => {
    const { rows } = buildItemSplit([line('Roti', 20, 15), line('Sizzler', 2, 900)]);
    expect(rows[0].name).toBe('Sizzler');
  });
});
