import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who may read an order.
 *
 * The route is the authorization boundary, so what it is tested for is the answer
 * it gives, not the plumbing: a signed-in customer gets their own order, a guest
 * gets only an ownerless one, and a stranger's order is a 404 either way — the same
 * answer a missing order gets, so ids cannot be probed across accounts.
 *
 * The store is the only order source now: the historical orders were imported into
 * WooCommerce, so a miss is answered as a miss rather than from a second store.
 */

type Viewer = { id: number; email: string; name: string } | null;

const state = {
  viewer: null as Viewer,
  wooOrder: null as Record<string, unknown> | null,
  /** When `wooOrder` is null, the status `getWooOrder` fails with. */
  wooErrorStatus: 404,
};

vi.mock('@/lib/auth/customerRequest', () => ({
  optionalCustomerRequest: async () => state.viewer,
}));

vi.mock('@/lib/woo/orders', () => ({
  HK_META: { userId: '_hk_user_id' },
  readWooOrderMeta: (order: Record<string, unknown>, key: string) => {
    const meta = (order.meta_data as Array<{ key: string; value: unknown }> | undefined) ?? [];
    const value = meta.find((entry) => entry.key === key)?.value;
    return value === undefined || value === null ? null : String(value);
  },
  getWooOrder: async (id: number) => {
    if (state.wooOrder) return { ...state.wooOrder, id };
    const error = new Error(`Order ${id} could not be read.`) as Error & { name: string; status: number };
    error.name = 'WooOrderError';
    error.status = state.wooErrorStatus;
    throw error;
  },
  // A genuine miss and a store failure must stay distinguishable; the real predicate
  // is small enough to restate so the mocked module stays honest.
  isWooOrderNotFound: (error: unknown) =>
    (error as { status?: number } | null)?.status === 404,
  orderWithItemsFromWoo: (order: Record<string, unknown>) => ({
    id: String(order.id),
    order_number: String(order.number ?? order.id),
    email: (order.billing as { email?: string } | undefined)?.email ?? '',
    order_items: [],
    __projection: true,
  }),
}));

import { POST } from './route';

function request(orderId: string): Request {
  return new Request('http://localhost/api/orders/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
}

const ownOrder = {
  id: 512,
  number: '512',
  customer_id: 41,
  billing: { email: 'shopper@example.com' },
  meta_data: [],
};

beforeEach(() => {
  state.viewer = null;
  state.wooOrder = null;
  state.wooErrorStatus = 404;
});

describe('POST /api/orders/get', () => {
  it('returns the signed-in customer their own order', async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.wooOrder = ownOrder;

    const response = await POST(request('512'));

    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe('512');
  });

  it("refuses another customer's order with the same 404 a missing order gets", async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.wooOrder = { ...ownOrder, customer_id: 77, billing: { email: 'someone@example.com' } };

    const response = await POST(request('512'));

    expect(response.status).toBe(404);
  });

  it('lets a guest read an ownerless order', async () => {
    state.viewer = null;
    state.wooOrder = { ...ownOrder, customer_id: 0, meta_data: [] };

    const response = await POST(request('512'));

    expect(response.status).toBe(200);
  });

  it('refuses a guest an order that belongs to a registered customer', async () => {
    state.viewer = null;
    state.wooOrder = { ...ownOrder, customer_id: 0, meta_data: [{ key: '_hk_user_id', value: '41' }] };

    const response = await POST(request('512'));

    expect(response.status).toBe(404);
  });

  it('answers a non-numeric id the store does not hold as missing', async () => {
    // Historical orders used to be read from a second store by ids like this one; they
    // are WooCommerce orders now, so an id the store does not hold is simply missing.
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };

    const response = await POST(request('legacy-uuid'));

    expect(response.status).toBe(404);
  });

  it('answers a numeric id the store does not hold as missing', async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };

    const response = await POST(request('4242'));

    expect(response.status).toBe(404);
  });

  it('answers a store failure as a failure rather than as a miss', async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.wooErrorStatus = 502; // the store is unreachable, not empty

    const response = await POST(request('512'));

    expect(response.status).toBe(500);
  });

  it('never trusts an order id to name its owner — a body userId is ignored', async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.wooOrder = { ...ownOrder, customer_id: 77, billing: { email: 'someone@example.com' } };

    const response = await POST(
      new Request('http://localhost/api/orders/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: '512', userId: '41' }),
      })
    );

    expect(response.status).toBe(404);
  });
});
