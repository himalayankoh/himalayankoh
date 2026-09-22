/**
 * Order arithmetic and the shapes a checkout sends — no backend.
 *
 * These used to live in `lib/supabase/api/orders.ts`, whose module-level
 * `import { supabase } from '../client'` put the Supabase SDK into the browser
 * bundle of every route that imported so much as `calculateOrderTotals` — a
 * bundler follows the whole module graph of an imported module, so one pure
 * constant carried the library with it. Same numbers, same rounding, same
 * behaviour; only the home changed. The data access moved to `./client`.
 *
 * The constants are the store's prices, not Supabase's, which is why they
 * belong here and not with the writer.
 */

import type { Order } from '@/lib/commerce/databaseTypes';

export const TAX_RATE = 0.0825;
export const FREE_SHIPPING_THRESHOLD = 50;
export const STANDARD_SHIPPING_COST = 9.95;
export const EXPEDITED_SHIPPING_COST = 18.95;

export type ShippingMethod = 'standard' | 'expedited';

/**
 * The coupons the checkout charges, in code.
 *
 * WooCommerce is the store's coupon system, but not every coupon it knows about
 * is one this app should honour — see `lib/woo/coupons.ts`, which reconciles the
 * two and is the reason a Woo coupon missing here is not a bug.
 */
export const supportedCoupons: Record<string, { label: string; percentage: number }> = {
  HKWELCOME10: { label: '10% welcome discount', percentage: 0.1 },
};

export interface OrderTotals {
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export interface TotalsLineItem {
  quantity: number;
  unitPrice: number;
}

export interface CalculateOrderOptions {
  couponCode?: string;
  shippingMethod?: ShippingMethod;
  /** Live Shippo rate amount — overrides flat-rate shipping when set. */
  shippingCostOverride?: number;
}

export function calculateOrderTotals(items: TotalsLineItem[], options: CalculateOrderOptions = {}): OrderTotals {
  const subtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const normalizedCoupon = options.couponCode?.trim().toUpperCase() || '';
  const coupon = supportedCoupons[normalizedCoupon];
  // Rounded to the cent before flowing into taxableSubtotal/total — otherwise
  // the unrounded discount (e.g. $9.95 * 10% = $0.995) makes the displayed
  // total off by a cent from subtotal - discount + tax + shipping, since each
  // of those is independently rounded for display but the total wasn't.
  const discountAmount = coupon ? Math.round(subtotal * coupon.percentage * 100) / 100 : 0;
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const shippingMethod = options.shippingMethod || 'standard';
  const shippingCost =
    typeof options.shippingCostOverride === 'number' && options.shippingCostOverride >= 0
      ? options.shippingCostOverride
      : shippingMethod === 'expedited'
        ? EXPEDITED_SHIPPING_COST
        : subtotal >= FREE_SHIPPING_THRESHOLD
          ? 0
          : STANDARD_SHIPPING_COST;
  const taxAmount = taxableSubtotal * TAX_RATE;
  const total = taxableSubtotal + shippingCost + taxAmount;

  return { subtotal, shippingCost, discountAmount, taxAmount, total };
}

export interface CreateOrderData {
  email: string;
  phone?: string;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethod?: string;
  paymentProvider?: 'invoice' | 'stripe';
  paymentIntentId?: string;
  paymentStatus?: Order['payment_status'];
  couponCode?: string;
  shippingMethod?: ShippingMethod;
  shippingCostOverride?: number;
  shippoRateId?: string;
  shippingCarrier?: string;
  shippingService?: string;
  notes?: string;
  /** Clear cart after order insert (default true). Stripe checkout clears after payment succeeds. */
  clearCart?: boolean;
}

export interface OrderFilters {
  status?: Order['status'];
  paymentStatus?: Order['payment_status'];
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}
