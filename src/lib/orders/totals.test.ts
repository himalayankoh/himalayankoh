import { describe, expect, it } from 'vitest';

import {
  calculateOrderTotals,
  EXPEDITED_SHIPPING_COST,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_COST,
  TAX_RATE,
} from './totals';

describe('calculateOrderTotals', () => {
  it('charges flat-rate standard shipping on an empty cart', () => {
    const totals = calculateOrderTotals([]);
    expect(totals.subtotal).toBe(0);
    expect(totals.shippingCost).toBe(STANDARD_SHIPPING_COST);
    expect(totals.discountAmount).toBe(0);
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBeCloseTo(STANDARD_SHIPPING_COST, 2);
  });

  it('sums quantities, adds standard shipping below the threshold, and tax', () => {
    const totals = calculateOrderTotals([{ quantity: 2, unitPrice: 10 }]);
    expect(totals.subtotal).toBeCloseTo(20, 4);
    expect(totals.shippingCost).toBe(STANDARD_SHIPPING_COST);
    expect(totals.discountAmount).toBe(0);
    expect(totals.taxAmount).toBeCloseTo(20 * TAX_RATE, 4);
    expect(totals.total).toBeCloseTo(20 + STANDARD_SHIPPING_COST + 20 * TAX_RATE, 2);
  });

  it('drops standard shipping at the free-shipping threshold', () => {
    const totals = calculateOrderTotals([{ quantity: 5, unitPrice: 10 }]);
    expect(totals.subtotal).toBeCloseTo(FREE_SHIPPING_THRESHOLD, 4);
    expect(totals.shippingCost).toBe(0);
    expect(totals.taxAmount).toBeCloseTo(FREE_SHIPPING_THRESHOLD * TAX_RATE, 4);
    expect(totals.total).toBeCloseTo(
      FREE_SHIPPING_THRESHOLD + FREE_SHIPPING_THRESHOLD * TAX_RATE,
      2
    );
  });

  it('charges expedited shipping even above the free-shipping threshold', () => {
    const totals = calculateOrderTotals(
      [{ quantity: 2, unitPrice: 30 }],
      { shippingMethod: 'expedited' }
    );
    expect(totals.subtotal).toBeCloseTo(60, 4);
    expect(totals.shippingCost).toBe(EXPEDITED_SHIPPING_COST);
    expect(totals.total).toBeCloseTo(60 + EXPEDITED_SHIPPING_COST + 60 * TAX_RATE, 2);
  });

  it('applies a known coupon percentage before tax but keeps free-shipping based on raw subtotal', () => {
    const totals = calculateOrderTotals(
      [{ quantity: 10, unitPrice: 10 }],
      { couponCode: 'HKWELCOME10' }
    );
    expect(totals.subtotal).toBeCloseTo(100, 4);
    expect(totals.discountAmount).toBeCloseTo(10, 4);
    expect(totals.shippingCost).toBe(0);
    expect(totals.taxAmount).toBeCloseTo(90 * TAX_RATE, 4);
    expect(totals.total).toBeCloseTo(90 + 90 * TAX_RATE, 2);
  });

  it('normalises coupon casing/whitespace and ignores unknown codes', () => {
    const withCoupon = calculateOrderTotals(
      [{ quantity: 10, unitPrice: 10 }],
      { couponCode: '  hkwelcome10  ' }
    );
    expect(withCoupon.discountAmount).toBeCloseTo(10, 4);

    const unknown = calculateOrderTotals(
      [{ quantity: 10, unitPrice: 10 }],
      { couponCode: 'NOTREAL' }
    );
    expect(unknown.discountAmount).toBe(0);
  });

  it('honours a non-negative shipping cost override', () => {
    const totals = calculateOrderTotals(
      [{ quantity: 1, unitPrice: 10 }],
      { shippingCostOverride: 4.99 }
    );
    expect(totals.shippingCost).toBeCloseTo(4.99, 4);
    expect(totals.total).toBeCloseTo(10 + 4.99 + 10 * TAX_RATE, 2);
  });

  it('treats a zero override as free shipping', () => {
    const totals = calculateOrderTotals(
      [{ quantity: 1, unitPrice: 10 }],
      { shippingCostOverride: 0 }
    );
    expect(totals.shippingCost).toBe(0);
  });

  it('ignores a negative override and falls back to the flat rate', () => {
    const totals = calculateOrderTotals(
      [{ quantity: 1, unitPrice: 10 }],
      { shippingCostOverride: -5 }
    );
    expect(totals.shippingCost).toBe(STANDARD_SHIPPING_COST);
  });

  it('sums multiple line items correctly', () => {
    const totals = calculateOrderTotals([
      { quantity: 3, unitPrice: 4.5 },
      { quantity: 2, unitPrice: 7.25 },
    ]);
    expect(totals.subtotal).toBeCloseTo(28, 4);
    expect(totals.shippingCost).toBe(STANDARD_SHIPPING_COST);
    expect(totals.taxAmount).toBeCloseTo(28 * TAX_RATE, 4);
    expect(totals.total).toBeCloseTo(28 + STANDARD_SHIPPING_COST + 28 * TAX_RATE, 2);
  });
});
