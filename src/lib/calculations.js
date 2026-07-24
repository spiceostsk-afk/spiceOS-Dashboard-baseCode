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

export const TABLE_STATUS = {
  available: 'available',
  occupied: 'occupied',
  billing: 'billing',
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

export function calcTax(subtotal) {
  return subtotal * TAX_RATE;
}

export function calcCgst(subtotal) {
  return subtotal * CGST_RATE;
}

export function calcSgst(subtotal) {
  return subtotal * SGST_RATE;
}

export function calcTotal(subtotal, discountAmount, serviceCharge) {
  return Math.max(0, subtotal - discountAmount + serviceCharge + calcTax(subtotal));
}

export const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});
