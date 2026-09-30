export const TAX_RATE = 0.1;
export const CGST_RATE = 0.05;
export const SGST_RATE = 0.05;
export const TABLE_CLEANUP_DELAY_MS = 60000;

export const SESSION_STATUS = {
  active: 'active',
  hold: 'hold',
  billing: 'billing',
  completed: 'completed',
  void: 'void',
};

/**
 * The order statuses the schema's check constraint allows.
 *
 * Note there is no 'delivered'. The dashboard used to filter live orders on
 * that value, so it matched nothing and every order stayed "live" for ever.
 */
export const ORDER_STATUS = {
  pending: 'pending',
  preparing: 'preparing',
  served: 'served',
  completed: 'completed',
  cancelled: 'cancelled',
};

/** Terminal states: an order here is done and no longer on the floor. */
export const FINISHED_ORDER_STATUSES = [ORDER_STATUS.completed, ORDER_STATUS.cancelled];

export const TABLE_STATUS = {
  available: 'available',
  occupied: 'occupied',
  // The schema calls this state 'payment'. The code said 'billing', which
  // matched nothing, so the billing badge silently counted zero for ever.
  billing: 'payment',
  cleaning: 'cleaning',
};

export function calcSubtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function calcDiscountAmount(subtotal, discountType, discountValue) {
  if (!discountValue || discountValue <= 0) return 0;
  if (discountType === 'percentage') return subtotal * (Math.min(discountValue, 100) / 100);
  if (discountType === 'flat') return Math.min(discountValue, subtotal);
  return 0;
}

export function calcServiceCharge(subtotal, serviceChargePercent) {
  if (!serviceChargePercent || serviceChargePercent <= 0) return 0;
  return subtotal * (Math.min(serviceChargePercent, 50) / 100);
}

// `rate` is a fraction (0.05 = 5%). The constants above are only the fallback
// for a restaurant that has never saved a GST rate — the live rate comes from
// Settings via useTaxRate().
export function calcTax(subtotal, rate = TAX_RATE) {
  return subtotal * rate;
}

// GST splits evenly into central and state halves.
export function calcCgst(subtotal, rate = TAX_RATE) {
  return subtotal * (rate / 2);
}

export function calcSgst(subtotal, rate = TAX_RATE) {
  return subtotal * (rate / 2);
}

export function calcTotal(subtotal, discountAmount, serviceCharge, rate = TAX_RATE) {
  return Math.max(0, subtotal - discountAmount + serviceCharge + calcTax(subtotal, rate));
}

/** "5" for 0.05, "2.5" for 0.025 — for labels like "Tax (5%)". */
export function formatRatePct(rate) {
  return String(Math.round(rate * 10000) / 100);
}

export const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});
