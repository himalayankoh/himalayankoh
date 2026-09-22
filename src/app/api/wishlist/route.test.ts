import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'app-admin';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_test';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_test';
});

/**
 * The session check is mocked so these tests are about the route's own rule:
 * whoever the session says the caller is, that is the only owner the route will
 * act on. (`/api/wishlist` is the boundary that lets the WordPress endpoint behind
 * it stay administrator-only.)
 */
vi.mock('@/lib/auth/customerRequest', () => ({
  verifyCustomerRequest: async (request: Request) =>
    request.headers.get('authorization') === 'Bearer good'
      ? { ok: true, customer: { id: 41, email: 'shopper@example.com', name: 'Shopper' } }
      : { ok: false, status: 401, error: 'Sign in to your account to continue.' },
}));

import { GET, POST } from './route';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

const wooProduct = {
  id: 2493,
  name: 'Himalayan Salt Coarse Grain — 6 lbs',
  slug: 'himalayan-salt-coarse-grain-6-lbs',
  price: '19.95',
  stock_status: 'instock',
  images: [{ src: 'https://cdn.test/6lbs.webp' }],
};

function request(init: RequestInit = {}): Request {
  return new Request('http://localhost/api/wishlist', init);
}

function post(body: unknown, authorized = true): Request {
  return request({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorized ? { Authorization: 'Bearer good' } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('authorisation', () => {
  it('refuses a request with no session and touches nothing', async () => {
    const stub = useWordPress([]);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('refuses a POST with no session', async () => {
    const stub = useWordPress([]);

    const response = await POST(post({ productId: 2493, action: 'add' }, false));

    expect(response.status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('uses the session owner even when the body names someone else', async () => {
    const stub = useWordPress([
      { path: '/hk-storefront/v1/wishlist', body: { items: [] } },
      { path: '/hk-storefront/v1/wishlist', method: 'POST', body: { ok: true } },
    ]);

    await POST(post({ productId: 2493, action: 'add', owner: 'someone-else' }));

    const write = stub.callsTo('/hk-storefront/v1/wishlist', 'POST')[0];
    // The whole point: an owner a browser can name is an owner a browser can forge.
    expect((write.body as { owner: string }).owner).toBe('41');
  });
});

describe('GET /api/wishlist', () => {
  it('joins saved ids to catalog details, newest first', async () => {
    useWordPress([
      {
        path: '/hk-storefront/v1/wishlist',
        body: {
          items: [
            { id: 9, owner: '41', product_id: 2493, created_at: '2026-09-01 10:00:00' },
            { id: 8, owner: '41', product_id: 2488, created_at: '2026-08-01 10:00:00' },
          ],
        },
      },
      { path: '/wc/v3/products', body: [wooProduct] },
    ]);

    const body = await (await GET(request({ headers: { Authorization: 'Bearer good' } }))).json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: 9,
      product_id: 2493,
      product: { name: 'Himalayan Salt Coarse Grain — 6 lbs', price: '$19.95' },
    });
  });

  it('reads nothing else when the wishlist is empty', async () => {
    const stub = useWordPress([{ path: '/hk-storefront/v1/wishlist', body: { items: [] } }]);

    const body = await (await GET(request({ headers: { Authorization: 'Bearer good' } }))).json();

    expect(body.items).toEqual([]);
    expect(stub.callsTo('/wc/v3/products')).toHaveLength(0);
  });
});

describe('POST /api/wishlist', () => {
  it('adds a product that is not saved yet and reports it as saved', async () => {
    const stub = useWordPress([
      { path: '/hk-storefront/v1/wishlist', body: { items: [] }, method: 'GET' },
      { path: '/hk-storefront/v1/wishlist', method: 'POST', body: { ok: true } },
    ]);

    const body = await (await POST(post({ productId: 2493, action: 'toggle' }))).json();

    expect(body.inWishlist).toBe(true);
    expect((stub.callsTo('/hk-storefront/v1/wishlist', 'POST')[0].body as { productId: number }).productId).toBe(2493);
  });

  it('removes a product that is already saved, and reports it as unsaved', async () => {
    useWordPress([
      {
        path: '/hk-storefront/v1/wishlist',
        method: 'GET',
        body: { items: [{ id: 9, owner: '41', product_id: 2493, created_at: '' }] },
      },
      { path: '/hk-storefront/v1/wishlist', method: 'DELETE', body: { ok: true, deleted: true } },
    ]);

    const body = await (await POST(post({ productId: 2493, action: 'toggle' }))).json();

    expect(body.inWishlist).toBe(false);
  });

  it('rejects a product id that WooCommerce could not have issued', async () => {
    const stub = useWordPress([]);

    const response = await POST(post({ productId: 'a-supabase-uuid', action: 'add' }));

    expect(response.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });

  it('rejects an unknown action rather than guessing', async () => {
    useWordPress([]);
    expect((await POST(post({ productId: 2493, action: 'archive' }))).status).toBe(400);
  });
});
