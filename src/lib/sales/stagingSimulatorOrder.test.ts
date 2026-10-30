import { describe, expect, it } from 'vitest';
import { buildSalesDashboard } from './engine';
import { formatPaymentMethod } from '@/lib/orders/display';
import type { WooOrderLike } from '@/lib/woo/orders';

/**
 * A simulated payment obeys the store's own revenue rules — it does not get a
 * special case.
 *
 * The dashboard is built with the **real** engine over synthetic WooCommerce orders,
 * so the assertions cover the arithmetic and the eligibility filter rather than a
 * stub of them. A simulated *success* becomes revenue because it is a genuinely paid
 * Woo order; a simulated *decline* is not revenue, and neither is a cancelled or
 * refunded simulation — no bypass, no exception, no manual import.
 */

const lineItems = [
  {
    id: 1,
    name: 'Pink Himalayan Salt — Fine',
    quantity: 2,
    price: 49.95,
    subtotal: '99.90',
    total: '99.90',
    product_id: 7,
    variation_id: 0,
  },
] as unknown as WooOrderLike['line_items'];

function baseOrder(overrides: Partial<WooOrderLike> = {}): WooOrderLike {
  return {
    id: 512,
    number: '512',
    status: 'processing',
    currency: 'USD',
    total: '99.90',
    discount_total: '0.00',
    shipping_total: '0.00',
    total_tax: '0.00',
    date_created_gmt: '2026-09-29T04:00:00',
    date_paid_gmt: '2026-09-29T04:01:00',
    payment_method: 'staging_test_card',
    payment_method_title: 'Staging Test Card',
    transaction_id: 'stg_test_pay_512',
    billing: {
      first_name: 'STAGING',
      last_name: 'PAYMENT TEST',
      email: 'staging-payment-test@himalayankoh.com',
    },
    line_items: lineItems,
    meta_data: [{ key: '_hk_payment_status', value: 'paid' }],
    ...overrides,
  } as unknown as WooOrderLike;
}

/** What the store returns after a simulated success: `set_paid`, then `processing`. */
const paidSimulatorOrder = (overrides: Partial<WooOrderLike> = {}) => baseOrder(overrides);

/** What it returns after a simulated decline: still pending, payment status failed. */
const declinedSimulatorOrder = () =>
  baseOrder({
    status: 'pending',
    date_paid_gmt: null,
    transaction_id: '',
    meta_data: [{ key: '_hk_payment_status', value: 'failed' }],
  });

describe('Sales & Profit — a simulated paid order', () => {
  it('counts as revenue with no import step, because it is a real paid Woo order', () => {
    const dashboard = buildSalesDashboard([paidSimulatorOrder()], 'all');

    expect(dashboard.revenue.orderCount).toBe(1);
    expect(dashboard.revenue.grossRevenue).toBe(99.9);
    expect(dashboard.revenue.netRevenue).toBe(99.9);
  });

  it('appears in the order list under its own honest payment label', () => {
    const dashboard = buildSalesDashboard([paidSimulatorOrder()], 'all');
    const row = dashboard.orders.find((order) => order.orderNumber === '512');

    expect(row).toBeDefined();
    expect(row?.paymentStatus).toBe('paid');
    expect(row?.paymentMethod).toBe('Staging Test Card');
  });
});

describe('Sales & Profit — a simulated decline', () => {
  it('is not revenue and is excluded from the counted orders', () => {
    const dashboard = buildSalesDashboard([declinedSimulatorOrder()], 'all');

    expect(dashboard.revenue.orderCount).toBe(0);
    expect(dashboard.revenue.grossRevenue).toBe(0);
    expect(dashboard.revenue.netRevenue).toBe(0);
  });

  it('does not become revenue later just because the order exists', () => {
    // The counterfactual that matters: the same total, the same cart, the only
    // difference being that the simulated card was declined.
    expect(buildSalesDashboard([declinedSimulatorOrder()], 'all').revenue.grossRevenue).toBe(0);
    expect(buildSalesDashboard([paidSimulatorOrder()], 'all').revenue.grossRevenue).toBe(99.9);
  });
});

describe('Sales & Profit — a cancelled or refunded simulation', () => {
  it('excludes a cancelled simulated order', () => {
    const dashboard = buildSalesDashboard(
      [paidSimulatorOrder({ status: 'cancelled', date_paid_gmt: null })],
      'all',
    );

    expect(dashboard.revenue.orderCount).toBe(0);
    expect(dashboard.revenue.grossRevenue).toBe(0);
  });

  it('records a refunded simulated order as a refund rather than as revenue', () => {
    // The simulator has no refund path of its own — a refund is whatever the store
    // recorded — so the assertion is that such an order is handled by the store's
    // ordinary rules, with no QA-specific exception either way.
    const dashboard = buildSalesDashboard([paidSimulatorOrder({ status: 'refunded' })], 'all');

    expect(dashboard.revenue.orderCount).toBe(0);
    expect(dashboard.revenue.grossRevenue).toBe(0);
    expect(dashboard.revenue.refunds).toBe(99.9);
  });
});

describe('the payment label a simulated order is shown with', () => {
  it('never reads as a card payment', () => {
    expect(formatPaymentMethod('staging_test_card')).toBe('Staging Test Card');
    expect(formatPaymentMethod('staging_test_card')).not.toContain('stripe');
    expect(formatPaymentMethod('staging_test_card')).not.toBe(formatPaymentMethod('stripe_card'));
  });
});
