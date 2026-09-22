import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who may read an order.
 *
 * The route is the authorization boundary, so what it is tested for is the answer
 * it gives, not the plumbing: a signed-in customer gets their own order, a guest
 * gets only an ownerless one, and a stranger's order is a 404 either way — the same
 * answer a missing order gets, so ids cannot be probed across accounts.
 */

type Viewer = { id: number; email: string; name: string } | null;

const state = {
  viewer: null as Viewer,
  wooOrder: null as Record<string, unknown> | null,
  /** When `wooOrder` is null, the status `getWooOrder` fails with. */
  wooErrorStatus: 404,
  legacy: null as Record<string, unknown> | null,
  legacyCalls: [] as string[],
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
  // The route must fall through to the legacy read only for a genuine miss; the
  // real predicate is small enough to restate so the mocked module stays honest.
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

vi.mock('@/lib/orders/legacyOrders', () => ({
  getLegacyOrderForViewer: async (id: string) => {
    state.legacyCalls.push(id);
    return state.legacy;
  },
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
  state.legacy = null;
  state.legacyCalls = [];
});

describe('POST /api/orders/get', () => {
  it('returns the signed-in customer their own order', async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.wooOrder = ownOrder;

    const response = await POST(request('512'));

    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe('512');
    // The legacy store is never consulted for an order the store holds.
    expect(state.legacyCalls).toEqual([]);
  });

  it("refuses another customer's order with the same 404 a missing order gets", async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.wooOrder = { ...ownOrder, customer_id: 77, billing: { email: 'someone@example.com' } };

    const response = await POST(request('512'));

    expect(response.status).toBe(404);
    // A store order that exists is not a legacy order, so nothing falls through.
    expect(state.legacyCalls).toEqual([]);
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

  it('falls back to the legacy store when the store has no such order', async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.legacy = { id: 'legacy-uuid', order_number: 'HK-1001', email: 'shopper@example.com' };

    const response = await POST(request('legacy-uuid'));

    expect(response.status).toBe(200);
    expect(state.legacyCalls).toEqual(['legacy-uuid']);
  });

  it('falls through to the legacy store for a numeric id the store does not hold', async () => {
    // A historical order can carry a numeric-looking id too, so "not in the store"
    // must be decided by the answer the store gave, not by the id's shape.
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.legacy = { id: '4242', order_number: 'HK-4242', email: 'shopper@example.com' };

    const response = await POST(request('4242'));

    expect(response.status).toBe(200);
    expect(state.legacyCalls).toEqual(['4242']);
  });

  it('answers a store failure as a failure rather than falling through to legacy', async () => {
    state.viewer = { id: 41, email: 'shopper@example.com', name: 'Shopper' };
    state.wooErrorStatus = 502; // the store is unreachable, not empty
    state.legacy = { id: '512', order_number: 'HK-512', email: 'shopper@example.com' };

    const response = await POST(request('512'));

    // Serving a legacy order for an id the store might hold would be a guess.
    expect(response.status).toBe(500);
    expect(state.legacyCalls).toEqual([]);
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
