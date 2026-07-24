import { describe, it, expect } from 'vitest';
import {
  calcSubtotal,
  calcDiscountAmount,
  calcServiceCharge,
  calcTax,
  calcCgst,
  calcSgst,
  calcTotal,
  TAX_RATE,
} from '../lib/calculations';

describe('calcSubtotal', () => {
  it('returns 0 for empty items', () => {
    expect(calcSubtotal([])).toBe(0);
  });

  it('calculates total from items', () => {
    const items = [
      { price: 100, qty: 2 },
      { price: 50, qty: 3 },
    ];
    expect(calcSubtotal(items)).toBe(350);
  });

  it('handles single item', () => {
    expect(calcSubtotal([{ price: 250, qty: 1 }])).toBe(250);
  });

  it('handles single item with decimal prices', () => {
    expect(calcSubtotal([{ price: 99.99, qty: 1 }])).toBeCloseTo(99.99);
  });

  it('handles zero qty items', () => {
    expect(calcSubtotal([{ price: 100, qty: 0 }])).toBe(0);
  });
});

describe('calcDiscountAmount', () => {
  it('returns 0 when no discount value', () => {
    expect(calcDiscountAmount(1000, 'percentage', 0)).toBe(0);
    expect(calcDiscountAmount(1000, 'percentage', null)).toBe(0);
    expect(calcDiscountAmount(1000, 'flat', 0)).toBe(0);
  });

  it('applies percentage discount', () => {
    expect(calcDiscountAmount(1000, 'percentage', 10)).toBe(100);
    expect(calcDiscountAmount(2000, 'percentage', 25)).toBe(500);
  });

  it('caps percentage discount at 100%', () => {
    expect(calcDiscountAmount(1000, 'percentage', 150)).toBe(1000);
  });

  it('applies flat discount', () => {
    expect(calcDiscountAmount(1000, 'flat', 200)).toBe(200);
    expect(calcDiscountAmount(1000, 'flat', 50)).toBe(50);
  });

  it('caps flat discount at subtotal', () => {
    expect(calcDiscountAmount(500, 'flat', 1000)).toBe(500);
  });

  it('returns 0 for unknown discount type', () => {
    expect(calcDiscountAmount(1000, 'invalid', 100)).toBe(0);
  });

  it('ignores negative discount values', () => {
    expect(calcDiscountAmount(1000, 'percentage', -10)).toBe(0);
    expect(calcDiscountAmount(1000, 'flat', -50)).toBe(0);
  });
});

describe('calcServiceCharge', () => {
  it('returns 0 when no percentage', () => {
    expect(calcServiceCharge(1000, 0)).toBe(0);
    expect(calcServiceCharge(1000, null)).toBe(0);
  });

  it('applies service charge percentage', () => {
    expect(calcServiceCharge(1000, 10)).toBe(100);
    expect(calcServiceCharge(500, 5)).toBe(25);
  });

  it('caps service charge at 50%', () => {
    expect(calcServiceCharge(1000, 75)).toBe(500);
  });

  it('ignores negative percentage', () => {
    expect(calcServiceCharge(1000, -10)).toBe(0);
  });
});

describe('calcTax', () => {
  it('computes tax at TAX_RATE', () => {
    expect(calcTax(1000)).toBe(1000 * TAX_RATE);
    expect(calcTax(0)).toBe(0);
  });
});

describe('calcCgst', () => {
  it('computes CGST at 5%', () => {
    expect(calcCgst(1000)).toBe(50);
    expect(calcCgst(0)).toBe(0);
  });
});

describe('calcSgst', () => {
  it('computes SGST at 5%', () => {
    expect(calcSgst(1000)).toBe(50);
    expect(calcSgst(0)).toBe(0);
  });
});

describe('calcTotal', () => {
  it('computes full total with tax', () => {
    const subtotal = 1000;
    const total = calcTotal(subtotal, 0, 0);
    expect(total).toBe(1000 + 1000 * TAX_RATE);
  });

  it('accounts for discount and service charge', () => {
    const subtotal = 1000;
    const discount = 100;
    const sc = 50;
    const afterDiscount = subtotal - discount + sc;
    const taxOnOriginal = subtotal * TAX_RATE;
    const expected = afterDiscount + taxOnOriginal;
    expect(calcTotal(subtotal, discount, sc)).toBe(expected);
  });

  it('never returns negative', () => {
    expect(calcTotal(0, 1000, 0)).toBe(0);
    expect(calcTotal(100, 500, 0)).toBe(0);
  });
});
