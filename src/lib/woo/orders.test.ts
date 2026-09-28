import { describe, expect, it } from 'vitest';
import {
  HK_META,
  appStatusFromWoo,
  lineItemsFromWoo,
  orderFromWoo,
  paymentStatusFromWoo,
  statsFromWooOrders,
  wooWritePlan,
  wooRefundedAmount,
  type WooOrderLike,
} from './orders';

/**
 * The projection from a WooCommerce order to this app's order shape.
 *
 * These are the tests that matter for the migration: if the store's status or its
 * money is read wrongly here, the console shows a confident wrong answer, which is
 * worse than showing nothing. No store is contacted — the fixtures are the shapes
 * REST v3 actually returns.
 */

function order(overrides: Partial<WooOrderLike> = {}): WooOrderLike {
  return {
    id: 2469,
    number: '2469',
    status: 'processing',
    currency: 'USD',
    date_created_gmt: '2026-09-18T10:00:00',
    date_modified_gmt: '2026-09-18T10:05:00',
    discount_total: '0.00',
    shipping_total: '9.95',
    total: '17.42',
    total_tax: '0.57',
    customer_id: 16,
    billing: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      address_1: '1 Analytical Way',
      city: 'Houston',
      state: 'TX',
      postcode: '77065',
      country: 'US',
      email: 'ada@example.com',
      phone: '8322246466',
    },
    shipping: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      address_1: '1 Analytical Way',
      city: 'Houston',
      state: 'TX',
      postcode: '77065',
      country: 'US',
    },
    line_items: [
      {
        id: 1,
        product_id: 2400,
        name: 'Himalayan Pink Edible Salt Fine Grain Pouch — 3 lbs',
        quantity: 1,
        sku: 'HK-ESF-3lbs',
        subtotal: '6.90',
        total: '6.90',
        price: 6.9,
        image: { src: 'https://himalayankoh.com/staging/wp-content/uploads/salt.jpg' },
      },
    ],
    meta_data: [],
    ...overrides,
  };
}

describe('WooCommerce order status mapping', () => {
  it('reads a native Woo status as the app status it corresponds to', () => {
    expect(appStatusFromWoo(order({ status: 'pending' }))).toBe('pending');
    expect(appStatusFromWoo(order({ status: 'on-hold' }))).toBe('pending');
    expect(appStatusFromWoo(order({ status: 'processing' }))).toBe('processing');
    expect(appStatusFromWoo(order({ status: 'completed' }))).toBe('delivered');
    expect(appStatusFromWoo(order({ status: 'cancelled' }))).toBe('cancelled');
    expect(appStatusFromWoo(order({ status: 'refunded' }))).toBe('refunded');
    expect(appStatusFromWoo(order({ status: 'failed' }))).toBe('pending');
  });

  it('prefers the app state in meta, so a shipped order does not read as processing', () => {
    const shipped = order({
      status: 'processing',
      meta_data: [{ key: HK_META.status, value: 'shipped' }],
    });
    expect(appStatusFromWoo(shipped)).toBe('shipped');
  });

  it('ignores meta that names a state this app does not have', () => {
    const bogus = order({
      status: 'completed',
      meta_data: [{ key: HK_META.status, value: 'teleported' }],
    });
    expect(appStatusFromWoo(bogus)).toBe('delivered');
  });

  it('writes the native status plus meta only for states WooCommerce lacks', () => {
    // These are the pairing the store and this app agree through.
    expect(wooWritePlan('shipped')).toEqual({ status: 'processing', meta: 'shipped' });
    expect(wooWritePlan('packed')).toEqual({ status: 'processing', meta: 'packed' });
    // A state WooCommerce has is not duplicated into meta.
    expect(wooWritePlan('delivered')).toEqual({ status: 'completed', meta: null });
    expect(wooWritePlan('cancelled')).toEqual({ status: 'cancelled', meta: null });
  });
});

describe('payment status', () => {
  it('treats the store’s own paid date as paid', () => {
    expect(paymentStatusFromWoo(order({ date_paid_gmt: '2026-09-18T10:01:00' }))).toBe('paid');
  });

  it('is pending for an unpaid order rather than guessing from its status', () => {
    expect(paymentStatusFromWoo(order({ status: 'processing' }))).toBe('pending');
  });

  it('lets the app’s own record win over an absent paid date', () => {
    const paid = order({ meta_data: [{ key: HK_META.paymentStatus, value: 'paid' }] });
    expect(paymentStatusFromWoo(paid)).toBe('paid');
  });

  it('reports a failed or refunded order as such', () => {
    expect(paymentStatusFromWoo(order({ status: 'failed' }))).toBe('failed');
    expect(paymentStatusFromWoo(order({ status: 'refunded' }))).toBe('refunded');
  });

  it('reports a partial refund without calling the whole order refunded', () => {
    const partial = order({
      date_paid_gmt: '2026-09-18T10:01:00',
      refunds: [{ id: 1, total: '-5.00' }],
    });
    expect(paymentStatusFromWoo(partial)).toBe('partially_refunded');
    expect(wooRefundedAmount(partial)).toBe(5);
  });

  it('treats a full refund recorded in refund rows as refunded', () => {
    const full = order({
      date_paid_gmt: '2026-09-18T10:01:00',
      refunds: [{ id: 1, total: '-17.42' }],
    });
    expect(paymentStatusFromWoo(full)).toBe('refunded');
    expect(wooRefundedAmount(full)).toBe(17.42);
  });
});

describe('order projection', () => {
  it('uses the store’s own money rather than recomputing it', () => {
    const projected = orderFromWoo(order());
    expect(projected.total).toBe(17.42);
    expect(projected.shipping_cost).toBe(9.95);
    expect(projected.tax_amount).toBe(0.57);
    expect(projected.subtotal).toBe(6.9);
    expect(projected.currency).toBe('USD');
  });

  it('keeps the store’s order number and id as the order’s identity', () => {
    const projected = orderFromWoo(order());
    expect(projected.id).toBe('2469');
    expect(projected.order_number).toBe('2469');
  });

  it('maps the billing address and never invents a missing field', () => {
    const projected = orderFromWoo(order({ shipping: undefined }));
    const shipping = projected.shipping_address as unknown as Record<string, unknown>;
    expect(shipping.addressLine1).toBe('1 Analytical Way');
    expect(projected.email).toBe('ada@example.com');
    expect(shipping.country).toBe('US');
  });

  it('treats WooCommerce’s zero date as unset', () => {
    const projected = orderFromWoo(order({ date_created_gmt: '0000-00-00 00:00:00' }));
    expect(projected.created_at).toBe(new Date(0).toISOString());
  });

  it('reads tracking and label details from the app’s own meta keys', () => {
    const projected = orderFromWoo(
      order({
        meta_data: [
          { key: HK_META.trackingNumber, value: '940011189956' },
          { key: HK_META.labelUrl, value: 'https://shippo.example/label.pdf' },
          { key: HK_META.carrier, value: 'USPS' },
          { key: HK_META.service, value: 'Priority' },
        ],
      })
    );
    expect(projected.tracking_number).toBe('940011189956');
    expect(projected.label_url).toBe('https://shippo.example/label.pdf');
    expect(projected.shipping_carrier).toBe('USPS');
    expect(projected.shipping_service).toBe('Priority');
  });
});

describe('line items', () => {
  it('derives a unit price from the line total and quantity', () => {
    const items = lineItemsFromWoo(
      order({
        line_items: [{ id: 7, product_id: 2400, name: 'Salt', quantity: 2, total: '13.80' }],
      })
    );
    expect(items[0].quantity).toBe(2);
    expect(items[0].total_price).toBe(13.8);
    expect(items[0].unit_price).toBe(6.9);
  });

  it('prefers the variation id, because that is the product the customer bought', () => {
    const items = lineItemsFromWoo(
      order({ line_items: [{ id: 3, product_id: 2400, variation_id: 2401, name: 'Salt 3 lbs', quantity: 1, total: '6.90' }] })
    );
    expect(items[0].product_id).toBe('2401');
  });

  it('reports a line item with no name honestly', () => {
    const items = lineItemsFromWoo(order({ line_items: [{ id: 4, quantity: 1, total: '1.00' }] }));
    expect(items[0].product_name).toBe('Unknown product');
  });
});

describe('dashboard figures', () => {
  it('counts orders by their app status and only counts paid money as revenue', () => {
    const stats = statsFromWooOrders([
      order({ id: 1, status: 'pending' }),
      order({ id: 2, status: 'processing', total: '10.00' }),
      order({ id: 3, status: 'completed', total: '20.00', date_paid_gmt: '2026-09-18T10:00:00' }),
      order({ id: 4, status: 'cancelled' }),
      order({ id: 5, status: 'refunded' }),
    ]);

    expect(stats.totalOrders).toBe(5);
    expect(stats.pendingOrders).toBe(1);
    expect(stats.processingOrders).toBe(1);
    expect(stats.deliveredOrders).toBe(1);
    expect(stats.cancelledOrders).toBe(2);
    // Only the completed order was recorded as paid, so only its total is revenue.
    expect(stats.totalRevenue).toBe(20);
    expect(stats.window).toBe(5);
  });

  it('counts a meta-only shipped order as shipped, not as processing', () => {
    const stats = statsFromWooOrders([
      order({ status: 'processing', meta_data: [{ key: HK_META.status, value: 'shipped' }] }),
    ]);
    expect(stats.shippedOrders).toBe(1);
    expect(stats.processingOrders).toBe(0);
  });
});
