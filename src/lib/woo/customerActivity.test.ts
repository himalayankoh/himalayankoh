import { describe, expect, it } from 'vitest';

import {
  accountKind,
  activityBasis,
  buildOrderActivity,
  guestOrderSummary,
  isVerifiedBuyer,
  localShape,
  suspiciousAccount,
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
    expect(activityBasis(null, { id: 999, email: 'nobody@example.net', ordersCount: 3 })).toBe('store-reported');
    expect(activityBasis(null, { id: 999 })).toBe('not-verifiable');
  });

  it('calls a checked zero a checked zero, not an unknown', () => {
    // The whole order book was read and no order carries this account. That is the
    // same finding `verifiedOrderCount` reports as 0, so the label must agree with it;
    // reporting it as `not-verifiable` would show a checked answer as an unchecked one.
    expect(verifiedOrderCount(index, { id: 999, email: 'nobody@example.net' })).toBe(0);
    expect(activityBasis(index, { id: 999, email: 'nobody@example.net' })).toBe('no-matching-order');
    // The store's own field does not relabel it: the index is what the figure came from.
    expect(activityBasis(index, { id: 999, email: 'nobody@example.net', ordersCount: 3 })).toBe(
      'no-matching-order'
    );
    // ...and a record with nothing to match against stays genuinely unverifiable.
    expect(activityBasis(index, { id: 0, email: '' })).toBe('not-verifiable');
    // ...as does a partial read, where the absence of an order proves nothing.
    const partial = buildOrderActivity({ orders: [{ customer_id: 20 }], ordersReported: 900 });
    expect(activityBasis(partial, { id: 999, email: 'nobody@example.net' })).toBe('not-verifiable');
  });
});

describe('guest orders', () => {
  it('counts only the orders that carry no customer account', () => {
    const index = buildOrderActivity({
      orders: [
        { customer_id: 0, billing: { email: 'guest@example.net' } },
        { customer_id: 0, billing: { email: 'guest@example.net' } },
        { customer_id: 20, billing: { email: 'account@example.net' } },
      ],
      ordersReported: 3,
    });

    expect(index.guestOrdersByEmail.get('guest@example.net')).toBe(2);
    // An account's order is in the buyer index but never in the guest half.
    expect(index.ordersByEmail.get('account@example.net')).toBe(1);
    expect(index.guestOrdersByEmail.has('account@example.net')).toBe(false);
    expect(guestOrderSummary(index)).toEqual({ addresses: 1, orders: 2 });
  });

  it('reports nothing rather than zero when there is no order index at all', () => {
    expect(guestOrderSummary(null)).toEqual({ addresses: 0, orders: 0 });
  });
});

describe('suspicious accounts', () => {
  it('names a reserved domain as certain, because no customer can own one', () => {
    const flags = suspiciousAccount({ email: 'a9f3aedfbbed4baf@example.com' });
    expect(flags.suspicious).toBe(true);
    expect(flags.reason).toMatch(/reserved for testing/);
  });

  it('names a machine-generated address with no name, in the census\u2019s own vocabulary', () => {
    const flags = suspiciousAccount({ email: 'a9f3aedfbbed4baf@gmail.com' });
    expect(flags.suspicious).toBe(true);
    expect(flags.shape).toBe('hex-run');
    expect(flags.reason).toMatch(/machine-generated/);
  });

  it('calls a machine-shaped address unproven rather than proven', () => {
    const flags = suspiciousAccount({ email: 'zx9k2m4p7q1w@gmail.com' });
    expect(flags.shape).toBe('long-mixed');
    expect(flags.suspicious).toBe(true);
    expect(flags.reason).toMatch(/unproven/);
  });

  it('does not call a nameless human-shaped address suspicious: the form collected no name from anybody', () => {
    const flags = suspiciousAccount({ email: 'ayaz.bashir@gmail.com' });
    expect(flags.shape).toBe('first.last');
    expect(flags.suspicious).toBe(false);
    expect(flags.reason).toBeNull();
  });

  it('never calls a named account suspicious, however odd its address looks', () => {
    expect(suspiciousAccount({ first_name: 'Ada', email: 'a9f3aedfbbed4baf@gmail.com' }).suspicious).toBe(false);
  });

  it('reads the same address shapes the cleanup census does', () => {
    expect(localShape('413c4d502c')).toBe('hex-run');
    // Hex first, exactly as the census does it: a run of ten digits is also a run of
    // hex characters, so `digits-only` is what is left once the hex rule has had its
    // say — a short numeric local part. The order matters, because a console that
    // classified these two the other way round would put them in different buckets
    // from the manifest it is reviewing.
    expect(localShape('9123456789')).toBe('hex-run');
    expect(localShape('1234567')).toBe('digits-only');
    expect(localShape('ayaz')).toBe('letters-only');
    expect(localShape('ayaz99')).toBe('letters+digits');
    expect(localShape('')).toBe('empty');
  });
});

describe('accountKind', () => {
  const index = buildOrderActivity({
    orders: [{ customer_id: 16 }, { customer_id: 0, billing: { email: 'guest@himalayankoh.com' } }],
    ordersReported: 2,
  });

  it('puts staff first, so a paying administrator is never presented as a shopper', () => {
    expect(accountKind({ id: 16, role: 'administrator', email: 'owner@himalayankoh.com' }, index)).toBe(
      'administrative'
    );
    expect(accountKind({ id: 26, role: 'shop_manager', email: 'staff@himalayankoh.com' }, index)).toBe(
      'administrative'
    );
    expect(accountKind({ id: 26, role: null, email: 'plain@himalayankoh.com' }, index)).toBe('registered');
  });

  it('separates a verified buyer from an account with no order against it', () => {
    expect(accountKind({ id: 16, role: 'customer', email: 'buyer@himalayankoh.com' }, index)).toBe('buyer');
    expect(accountKind({ id: 999, role: 'customer', email: 'nobody@himalayankoh.com' }, index)).toBe(
      'registered'
    );
  });

  it('ranks suspicious ahead of registered, because that is the review list', () => {
    expect(accountKind({ id: 2035, role: 'customer', email: '413c4d502c@gmail.com' }, index)).toBe('suspicious');
  });

  it('never calls an account a buyer when the order book could not be read', () => {
    const partial = buildOrderActivity({ orders: [{ customer_id: 20 }], ordersReported: 900 });
    expect(accountKind({ id: 999, role: 'customer', email: 'x@himalayankoh.com' }, partial)).toBe('registered');
  });
});
