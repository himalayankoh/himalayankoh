import { describe, expect, it } from 'vitest';

import {
  activityBasis,
  buildOrderActivity,
  isVerifiedBuyer,
  verifiedOrderCount,
} from './customerActivity';

/**
 * The store omits `orders_count` from every customer record, so "has this person
 * bought?" can only be answered from orders. These tests pin both answers,
 * including the one that matters most: a partial read must not turn into "never
 * bought".
 */
describe('buildOrderActivity', () => {
  it('counts orders per customer id and per billing address', () => {
    const index = buildOrderActivity({
      orders: [
        { customer_id: 20, billing: { email: 'A@example.net' } },
        { customer_id: 20, billing: { email: 'a@example.net' } },
        { customer_id: 0, billing: { email: 'guest@example.net' } },
      ],
      ordersReported: 3,
    });

    expect(index.ordersByCustomerId.get(20)).toBe(2);
    expect(index.ordersByEmail.get('a@example.net')).toBe(2);
    expect(index.ordersByEmail.get('guest@example.net')).toBe(1);
    expect(index.complete).toBe(true);
  });

  it('is incomplete when the store reports more orders than were read', () => {
    const index = buildOrderActivity({ orders: [{ customer_id: 7 }], ordersReported: 900 });
    expect(index.ordersRead).toBe(1);
    expect(index.complete).toBe(false);
  });

  it('is complete when the store reports no total at all', () => {
    expect(buildOrderActivity({ orders: [], ordersReported: null }).complete).toBe(true);
  });
});

describe('verifiedOrderCount', () => {
  const index = buildOrderActivity({
    orders: [
      { customer_id: 20, billing: { email: 'ayaz@example.net' } },
      { customer_id: 0, billing: { email: 'guest@example.net' } },
    ],
    ordersReported: 2,
  });

  it('matches by id first, so a shared family address cannot inflate a history', () => {
    expect(verifiedOrderCount(index, { id: 20, email: 'someone.else@example.net' })).toBe(1);
  });

  it('matches a registered account by its billing address when the order was a guest order', () => {
    expect(verifiedOrderCount(index, { id: 999, email: 'guest@example.net' })).toBe(1);
  });

  it('answers zero for a customer with no orders, when every order was read', () => {
    expect(verifiedOrderCount(index, { id: 1234, email: 'nobody@example.net' })).toBe(0);
  });

  it('answers null, not zero, when the read was truncated', () => {
    const partial = buildOrderActivity({ orders: [{ customer_id: 20 }], ordersReported: 900 });
    expect(verifiedOrderCount(partial, { id: 1234, email: 'nobody@example.net' })).toBeNull();
    // ...but a customer who *did* appear is still a verified buyer.
    expect(verifiedOrderCount(partial, { id: 20 })).toBe(1);
  });

  it('answers null when there is nothing to match against', () => {
    expect(verifiedOrderCount(index, { id: 0, email: '' })).toBeNull();
    expect(verifiedOrderCount(null, { id: 20, email: 'ayaz@example.net' })).toBeNull();
  });
});

describe('isVerifiedBuyer', () => {
  it('only calls an account a buyer on evidence', () => {
    const index = buildOrderActivity({ orders: [{ customer_id: 20 }], ordersReported: 1 });
    expect(isVerifiedBuyer(index, { id: 20 })).toBe(true);
    expect(isVerifiedBuyer(index, { id: 21 })).toBe(false);
    const partial = buildOrderActivity({ orders: [{ customer_id: 20 }], ordersReported: 900 });
    expect(isVerifiedBuyer(partial, { id: 21 })).toBe(false);
    expect(verifiedOrderCount(partial, { id: 21 })).toBeNull();
  });
});

describe('activityBasis', () => {
  const index = buildOrderActivity({
    orders: [{ customer_id: 20 }, { customer_id: 0, billing: { email: 'guest@example.net' } }],
    ordersReported: 2,
  });

  it('names how the figure was arrived at', () => {
    expect(activityBasis(index, { id: 20 })).toBe('customer-id');
    expect(activityBasis(index, { id: 999, email: 'guest@example.net' })).toBe('billing-email');
    expect(activityBasis(index, { id: 999, email: 'nobody@example.net' })).toBe('not-verifiable');
    expect(activityBasis(index, { id: 999, email: 'nobody@example.net', ordersCount: 3 })).toBe('store-reported');
    expect(activityBasis(null, { id: 999 })).toBe('not-verifiable');
  });
});
