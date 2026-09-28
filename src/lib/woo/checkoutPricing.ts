import { createHash } from 'node:crypto';
import type { WooOrderLike } from './orders';

export interface AuthoritativeCheckoutTotals {
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

function money(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(value: number): number {
  return value / 100;
}

/**
 * Extracts an order's already-calculated totals without inventing tax rules.
 * Line totals are used for subtotal where possible because REST v3's line item
 * subtotal fields preserve pre-discount values; the order-level total remains
 * WooCommerce's final, authoritative charge amount.
 */
export function checkoutTotalsFromWoo(order: WooOrderLike): AuthoritativeCheckoutTotals {
  const items = order.line_items ?? [];
  const lineSubtotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = money(item.price);
    const itemSubtotal = money(item.subtotal) ?? money(item.total) ?? 0;
    return sum + (unitPrice !== null && quantity > 0 ? Math.max(itemSubtotal, unitPrice * quantity) : itemSubtotal);
  }, 0);
  const subtotal = cents(lineSubtotal) / 100;
  const discountAmount = cents(money(order.discount_total) ?? 0) / 100;
  const shippingCost = cents(money(order.shipping_total) ?? 0) / 100;
  const taxAmount = cents(money(order.total_tax) ?? 0) / 100;
  const sumOfComponents = cents(subtotal - discountAmount + shippingCost + taxAmount);
  const reportedTotal = money(order.total);
  const total = reportedTotal === null ? fromCents(sumOfComponents) : cents(reportedTotal) / 100;

  return { subtotal, shippingCost, discountAmount, taxAmount, total };
}

/** A private, stable identity for checkout inputs that change the charged total. */
export function checkoutInputFingerprint(input: {
  cartFingerprint: string;
  email: string;
  shippingAddress: unknown;
  billingAddress: unknown;
  shippingMethod: string;
  shippingRateId?: string | null;
  shippingCost: number;
  couponCode?: string | null;
  discountAmount: number;
  taxAmount: number;
}): string {
  return createHash('sha256')
    .update(JSON.stringify({
      cart: input.cartFingerprint,
      email: input.email.trim().toLowerCase(),
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
      shippingMethod: input.shippingMethod,
      shippingRateId: input.shippingRateId ?? null,
      shippingCostCents: cents(input.shippingCost),
      couponCode: input.couponCode?.trim().toUpperCase() ?? '',
      discountCents: cents(input.discountAmount),
      taxCents: cents(input.taxAmount),
    }))
    .digest('hex');
}

/** Compare a Woo order with an amount/currency in Stripe's minor-unit format. */
export function stripeAmountMatchesWooOrder(
  order: WooOrderLike,
  amount: number,
  currency: string,
): boolean {
  const total = money(order.total);
  if (total === null || !Number.isInteger(amount) || amount < 0) return false;
  return (order.currency ?? 'USD').toLowerCase() === currency.toLowerCase() && cents(total) === amount;
}
