import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The customer list, tested against a stubbed store.
 *
 * Three defects live here, all measured against the live store, and none may return:
 *
 * 1. **The default list is not "the customers".** `/wc/v3/customers` answers with role
 *    `customer` only, which on this store reports 2,704 accounts where 2,707 exist.
 *    The three it withholds are staff accounts — one of them the owner's own
 *    administrator account, which carries two completed orders from 2023. A buyer
 *    list that cannot show a paying account is wrong, so the console asks for `all`.
 * 2. **`orders_count` is absent from every record**, so a filter on it matched nothing,
 *    always. Buyer status comes from the order index instead.
 * 3. **Unknown is not zero.** When the order read could not cover a customer, the
 *    filter must not decide that they never bought — an unanswered question is not a
 *    negative answer.
 */

const response = vi.fn();

vi.mock('../backend/wordpress', () => ({
  wordpressRequest: vi.fn(),
  wordpressRequestWithMeta: (path: string, options?: unknown) => response(path, options),
}));

vi.mock('../backend/credentials', () => ({
  requireWooCredentials: () => undefined,
}));

import { buildOrderActivity } from './customerActivity';
import { listWooCustomers, summariseCustomer, type WooCustomerRecord } from './customers';

function customer(overrides: Partial<WooCustomerRecord> = {}): WooCustomerRecord {
  return { id: 17, email: 'ayaz@example.net', role: 'customer', ...overrides };
}

function pageOf(data: WooCustomerRecord[], total = data.length): { data: WooCustomerRecord[]; total: number; totalPages: number } {
  return { data, total, totalPages: Math.ceil(total / Math.max(data.length, 1)) || 1 };
}

beforeEach(() => {
  response.mockReset();
});

describe('listWooCustomers', () => {
  it('asks for every role when asked, because the default answer hides paying accounts', async () => {
    response.mockResolvedValueOnce(pageOf([customer({ id: 16, role: 'administrator' })]));

    await listWooCustomers({ role: 'all' });

    expect(response.mock.calls[0][0]).toBe('/wc/v3/customers');
    expect(response.mock.calls[0][1]).toMatchObject({ params: { role: 'all' }, useCredentials: true });
  });

  it('leaves the store on its own default when no role is asked for', async () => {
    response.mockResolvedValueOnce(pageOf([customer()]));

    await listWooCustomers({ perPage: 25 });

    const params = (response.mock.calls[0][1] as { params: Record<string, unknown> }).params;
    // Present-but-undefined, which URLSearchParams drops: the store's own default stands.
    expect(params.role).toBeUndefined();
  });

  it('passes the search term through rather than filtering locally', async () => {
    response.mockResolvedValueOnce(pageOf([customer()]));

    await listWooCustomers({ search: 'ayaz' });

    expect(response.mock.calls[0][1]).toMatchObject({ params: { search: 'ayaz' } });
  });
});

describe('the buyers-only filter', () => {
  const index = buildOrderActivity({
    orders: [{ customer_id: 17, billing: { email: 'ayaz@example.net' } }],
    ordersReported: 1,
  });

  it('keeps an account an order points at and drops one it does not', async () => {
    response.mockResolvedValueOnce(pageOf([customer({ id: 17 }), customer({ id: 2035, email: 'junk@example.net' })]));

    const page = await listWooCustomers({ payingOnly: true, activity: index });

    expect(page.customers.map((row) => row.id)).toEqual([17]);
  });

  it('does not call an account a buyer when the order read could not cover it', async () => {
    const partial = buildOrderActivity({ orders: [{ customer_id: 17 }], ordersReported: 900 });
    response.mockResolvedValueOnce(pageOf([customer({ id: 17 }), customer({ id: 2035, email: 'junk@example.net' })]));

    const page = await listWooCustomers({ payingOnly: true, activity: partial });

    // The match is evidence whatever was read; the absence proves nothing.
    expect(page.customers.map((row) => row.id)).toEqual([17]);
  });

  it('falls back to the store’s own count only when there is no order index', async () => {
    response.mockResolvedValueOnce(pageOf([customer({ id: 17, orders_count: 3 }), customer({ id: 18 })]));

    const page = await listWooCustomers({ payingOnly: true });

    expect(page.customers.map((row) => row.id)).toEqual([17]);
  });
});

describe('the console row', () => {
  it('carries the role, so a staff account is not passed off as a shopper', () => {
    expect(summariseCustomer(customer({ id: 16, role: 'administrator' })).role).toBe('administrator');
    expect(summariseCustomer(customer({ role: undefined })).role).toBeNull();
  });

  it('leaves figures the store does not report unknown', () => {
    const row = summariseCustomer(customer());
    expect(row.ordersCount).toBeNull();
    expect(row.totalSpent).toBeNull();
  });

  it('reports a checked zero as a checked zero', () => {
    const index = buildOrderActivity({ orders: [{ customer_id: 17 }], ordersReported: 1 });
    const row = summariseCustomer(customer({ id: 2035, email: 'junk@example.net' }), index);
    expect(row.verifiedOrders).toBe(0);
    expect(row.activityBasis).toBe('no-matching-order');
  });

  it('counts orders from the store’s own order records when it can', () => {
    const index = buildOrderActivity({
      orders: [
        { customer_id: 17, billing: { email: 'ayaz@example.net' } },
        { customer_id: 17, billing: { email: 'ayaz@example.net' } },
      ],
      ordersReported: 2,
    });
    const row = summariseCustomer(customer({ id: 17 }), index);
    expect(row.verifiedOrders).toBe(2);
    expect(row.activityBasis).toBe('customer-id');
  });
});
