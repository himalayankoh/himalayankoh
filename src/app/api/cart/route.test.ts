import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  // Binding a signed-in shopper's cart happens through the plugin's own namespace,
  // which is guarded by an administrator application password.
  process.env.WORDPRESS_ADMIN_USER = 'salman';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
});

/**
 * The cookie module is mocked, not `next/headers`: what this route needs to prove
 * is that it *reads* the session and *writes back* whatever the store rotated,
 * which is a statement about the route, not about Next's cookie plumbing.
 */
const cookies = vi.hoisted(() => ({
  session: { cartToken: null as string | null, nonce: null as string | null },
  writes: [] as Array<{ cartToken: string | null; nonce: string | null }>,
}));

vi.mock('@/lib/cart/cookies', () => ({
  readCartSession: async () => cookies.session,
  writeCartSession: async (session: { cartToken: string | null; nonce: string | null }) => {
    cookies.writes.push(session);
  },
  clearCartSession: async () => {},
}));

import { GET, POST } from './route';
import { createCustomerSession } from '@/lib/auth/customerSession';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

function cartItem(overrides: Record<string, unknown> = {}) {
  return {
    key: 'line-1',
    id: 2493,
    quantity: 2,
    name: 'Himalayan Salt Coarse Grain — 6 lbs',
    sku: 'HK-SFL-C-6lbs',
    images: [{ src: 'https://cdn.test/6lbs.webp' }],
    prices: { price: '1995', currency_minor_unit: 2 },
    totals: { line_total: '3990', currency_minor_unit: 2 },
    quantity_limits: { maximum: 9999, editable: true },
    ...overrides,
  };
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * A cart read with no session attached. The route takes the request because a
 * signed-in shopper's cart is bound to their account (`lib/cart/accountCart.ts`);
 * none of these requests carry a session, so they are all the guest path.
 */
function cartRequest(): Request {
  return new Request('http://localhost/api/cart');
}

beforeEach(() => {
  cookies.session = { cartToken: 'cart-token-1', nonce: 'nonce-1' };
  cookies.writes = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GET /api/cart', () => {
  it('returns the store\u2019s cart in the shape the storefront reads', async () => {
    useWordPress([{ path: '/wc/store/v1/cart', body: { items: [cartItem()], items_count: 2 } }]);

    const response = await GET(cartRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.itemsCount).toBe(2);
    expect(body.items[0]).toMatchObject({
      key: 'line-1',
      productId: '2493',
      unitPrice: 19.95,
      quantity: 2,
      editable: true,
    });
  });

  it('adopts a rotated cart token and nonce, so the next request is the same cart', async () => {
    useWordPress([
      {
        path: '/wc/store/v1/cart',
        body: { items: [] },
        headers: { 'cart-token': 'cart-token-2', nonce: 'nonce-2' },
      },
    ]);

    await GET(cartRequest());

    expect(cookies.writes.at(-1)).toEqual({ cartToken: 'cart-token-2', nonce: 'nonce-2' });
  });

  it('passes WooCommerce\u2019s own cart warnings through', async () => {
    useWordPress([
      {
        path: '/wc/store/v1/cart',
        body: {
          items: [cartItem({ quantity: 9 })],
          errors: [{ code: 'woocommerce_rest_cart_product_no_stock', message: 'Sorry, we do not have enough stock.' }],
        },
      },
    ]);

    expect((await (await GET(cartRequest())).json()).issues).toEqual(['Sorry, we do not have enough stock.']);
  });
});

describe('POST /api/cart', () => {
  it('refuses a non-positive quantity without troubling the store', async () => {
    const stub = useWordPress([{ path: '/wc/store/v1/cart/add-item', method: 'POST', body: { items: [] } }]);

    const response = await POST(post({ action: 'add', productId: '2493', quantity: 0 }));

    expect(response.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });

  it('adds an item and answers with the store\u2019s resulting cart', async () => {
    const stub = useWordPress([
      {
        path: '/wc/store/v1/cart/add-item',
        method: 'POST',
        status: 201,
        body: { items: [cartItem()], items_count: 2 },
      },
    ]);

    const response = await POST(post({ action: 'add', productId: '2493', quantity: 2 }));

    expect(response.status).toBe(200);
    expect(stub.callsTo('/wc/store/v1/cart/add-item', 'POST')[0].body).toEqual({
      id: 2493,
      quantity: 2,
    });
  });

  it('reports the store\u2019s refusal with the store\u2019s own wording', async () => {
    useWordPress([
      {
        path: '/wc/store/v1/cart/add-item',
        method: 'POST',
        status: 400,
        body: { code: 'woocommerce_rest_product_not_purchasable', message: 'Sorry, this product cannot be purchased.' },
      },
    ]);

    const response = await POST(post({ action: 'add', productId: '9999', quantity: 1 }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Sorry, this product cannot be purchased.');
  });

  it('treats a zero quantity as a removal, which the store would otherwise reject', async () => {
    const stub = useWordPress([
      { path: '/wc/store/v1/cart/remove-item', method: 'POST', body: { items: [] } },
      { path: '/wc/store/v1/cart/update-item', method: 'POST', body: { items: [] } },
    ]);

    await POST(post({ action: 'setQuantity', key: 'line-1', quantity: 0 }));

    expect(stub.callsTo('/wc/store/v1/cart/remove-item', 'POST')).toHaveLength(1);
    expect(stub.callsTo('/wc/store/v1/cart/update-item', 'POST')).toHaveLength(0);
  });

  it('changes a line quantity without touching the others', async () => {
    const stub = useWordPress([
      { path: '/wc/store/v1/cart/update-item', method: 'POST', body: { items: [cartItem({ quantity: 3 })] } },
    ]);

    const response = await POST(post({ action: 'setQuantity', key: 'line-1', quantity: 3 }));

    expect(response.status).toBe(200);
    expect(stub.callsTo('/wc/store/v1/cart/update-item', 'POST')[0].body).toEqual({
      key: 'line-1',
      quantity: 3,
    });
  });

  it('empties the cart by removing every line the store reports', async () => {
    const stub = useWordPress([
      {
        path: '/wc/store/v1/cart',
        body: { items: [cartItem({ key: 'line-1' }), cartItem({ key: 'line-2' })] },
        headers: { nonce: 'fresh-nonce' },
      },
      { path: '/wc/store/v1/cart/remove-item', method: 'POST', body: { items: [] } },
    ]);

    const response = await POST(post({ action: 'clear' }));

    expect(response.status).toBe(200);
    expect(stub.callsTo('/wc/store/v1/cart/remove-item', 'POST').map((call) => call.body)).toEqual([
      { key: 'line-1' },
      { key: 'line-2' },
    ]);
  });

  it('rejects an unknown action rather than silently doing nothing', async () => {
    useWordPress([{ path: '/wc/store/v1/cart', body: { items: [] } }]);
    expect((await POST(post({ action: 'teleport' }))).status).toBe(400);
  });

  it('reports a WordPress PHP fatal as a store failure, not as an empty cart', async () => {
    useWordPress([
      {
        path: '/wc/store/v1/cart',
        status: 500,
        raw: '<!DOCTYPE html><html><body><p>There has been a critical error on this website.</p></body></html>',
      },
    ]);

    const response = await GET(cartRequest());

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('PHP fatal');
  });

  it('answers an unreachable store with 502, never with "no store configured"', async () => {
    globalThis.fetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    const response = await GET(cartRequest());
    const body = await response.json();

    // A transient network failure must not read as "run without a server cart":
    // that would empty a real cart in the browser.
    expect(response.status).toBe(502);
    expect(body.code).toBeUndefined();
  });
});

/**
 * Grain size is a real WooCommerce variation now, so adding to the cart is where
 * the storefront's selector becomes a cart line.
 */
describe('adding a variation', () => {
  const ADDED = {
    method: 'POST',
    path: '/wc/store/v1/cart/add-item',
    body: { items: [cartItem()] },
  };

  it('passes the chosen option to the store, which prices the line itself', async () => {
    const wp = useWordPress([ADDED]);

    const response = await POST(
      post({
        action: 'add',
        productId: '2492',
        quantity: 1,
        variation: { attribute: 'pa_grain-size', value: 'coarse-grain' },
      })
    );

    expect(response.status).toBe(200);
    expect(wp.callsTo('/wc/store/v1/cart/add-item', 'POST')[0].body).toEqual({
      id: 2492,
      quantity: 1,
      variation: [{ attribute: 'pa_grain-size', value: 'coarse-grain' }],
    });
  });

  it('reports the option on the cart line it returns', async () => {
    useWordPress([
      {
        method: 'POST',
        path: '/wc/store/v1/cart/add-item',
        body: { items: [cartItem({ variation: [{ attribute: 'pa_grain-size', value: 'coarse-grain' }] })] },
      },
    ]);

    const body = await (
      await POST(
        post({
          action: 'add',
          productId: '2492',
          quantity: 1,
          variation: { attribute: 'pa_grain-size', value: 'coarse-grain' },
        })
      )
    ).json();

    // What the drawer and the order line caption the product with.
    expect(body.items[0].variationLabel).toBe('Coarse Grain');
  });

  it('refuses half an option rather than adding the wrong line', async () => {
    const wp = useWordPress([ADDED]);

    const response = await POST(
      post({ action: 'add', productId: '2492', quantity: 1, variation: { attribute: 'pa_grain-size' } })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('A variation needs both an attribute and a value.');
    expect(wp.calls).toHaveLength(0);
  });

  it('refuses an option too long to be a real one', async () => {
    const response = await POST(
      post({
        action: 'add',
        productId: '2492',
        quantity: 1,
        variation: { attribute: 'pa_grain-size', value: 'x'.repeat(192) },
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('That variation option is not a value this store can use.');
  });
});

/**
 * The other half of the cart migration: a signed-in shopper's cart is bound to
 * their account, which is what lets a second device adopt it.
 */
describe('the cart of a signed-in customer', () => {
  beforeEach(() => {
    process.env.CUSTOMER_SESSION_SECRET = 'customer-secret-long-enough-to-sign';
  });

  afterEach(() => {
    delete process.env.CUSTOMER_SESSION_SECRET;
  });

  async function signedIn(body: unknown): Promise<Request> {
    const { token } = await createCustomerSession({
      customerId: 42,
      email: 'shopper@example.com',
      name: 'Ada',
    });
    return new Request('http://localhost/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  const ADDED = {
    method: 'POST',
    path: '/wc/store/v1/cart/add-item',
    body: { items: [cartItem()] },
    headers: { 'cart-token': 'cart-token-2', nonce: 'nonce-2' },
  };

  it('binds the cart to the account on every mutation', async () => {
    const wp = useWordPress([ADDED, { method: 'POST', path: '/hk-storefront/v1/cart-session', body: {} }]);

    const response = await POST(await signedIn({ action: 'add', productId: '2493', quantity: 1 }));

    expect(response.status).toBe(200);
    // Whatever token the store rotated to, not the one the request arrived with:
    // the binding has to name the cart the shopper is actually looking at.
    expect(wp.callsTo('/hk-storefront/v1/cart-session', 'POST')[0].body).toEqual({
      customerId: 42,
      cartToken: 'cart-token-2',
      nonce: 'nonce-2',
    });
  });

  it('still returns the cart when the binding cannot be stored', async () => {
    useWordPress([ADDED]);

    const response = await POST(await signedIn({ action: 'add', productId: '2493', quantity: 1 }));

    // A WordPress that cannot store the binding must not cost the shopper the cart
    // they just added to; it stays this browser's until the plugin is there.
    expect(response.status).toBe(200);
    expect((await response.json()).items).toHaveLength(1);
  });

  it('does not write to WordPress for a read', async () => {
    const wp = useWordPress([{ path: '/wc/store/v1/cart', body: { items: [cartItem()] } }]);

    await GET(cartRequest());

    expect(wp.callsTo('/hk-storefront/v1/cart-session')).toHaveLength(0);
  });
});
