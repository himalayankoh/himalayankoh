import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'salman';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
});

/** The cookie jar, mocked for the same reason the cart route's test mocks it: the
 *  claim under test is which session the route hands the browser. */
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

import { POST } from './route';
import { verifyCustomerSessionToken } from '@/lib/auth/customerSession';

const realFetch = globalThis.fetch;
const CUSTOMER = {
  id: 42,
  email: 'Shopper@Example.com',
  name: 'Ada Lovelace',
  username: 'ada',
  roles: ['customer'],
};

const LOGIN = '/hk-storefront/v1/customer/login';
const CART_SESSION = '/hk-storefront/v1/cart-session';

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/auth/customer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/auth/customer/login', () => {
  beforeEach(() => {
    process.env.CUSTOMER_SESSION_SECRET = 'customer-secret-long-enough-to-sign';
    cookies.session = { cartToken: null, nonce: null };
    cookies.writes = [];
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.CUSTOMER_SESSION_SECRET;
  });

  it('fails closed when the deployment has no signing key', async () => {
    delete process.env.CUSTOMER_SESSION_SECRET;
    const wp = useWordPress([]);

    const res = await POST(post({ login: 'shopper@example.com', password: 'hunter2!' }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error:
        'Customer sign-in is not configured on this deployment: set CUSTOMER_SESSION_SECRET in the server environment.',
    });
    expect(wp.calls).toHaveLength(0);
  });

  it('rejects a malformed body', async () => {
    const res = await POST(post('not json'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body.' });
  });

  it('reports a wrong password without minting anything', async () => {
    useWordPress([
      {
        method: 'POST',
        path: LOGIN,
        status: 401,
        body: { code: 'hk_storefront_invalid_credentials', message: 'Wrong email or password.' },
      },
    ]);

    const res = await POST(post({ login: 'shopper@example.com', password: 'wrong' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Wrong email or password.' });
  });

  it('names the plugin when it is not active, rather than blaming the password', async () => {
    useWordPress([]);

    const res = await POST(post({ login: 'shopper@example.com', password: 'hunter2!' }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/storefront plugin is not active/);
  });

  it('signs the shopper in with a session keyed by their WooCommerce customer id', async () => {
    useWordPress([{ method: 'POST', path: LOGIN, body: { customer: CUSTOMER } }]);

    const res = await POST(post({ login: 'Shopper@Example.com', password: 'hunter2!' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      expiresAt: number;
      customer: { id: number; email: string; name: string };
      cart: { adopted: boolean; merged: number; error: string | null };
    };

    const payload = await verifyCustomerSessionToken(body.token);
    expect(payload?.cid).toBe(42);
    expect(payload?.email).toBe('shopper@example.com');
    expect(body.customer).toEqual({ id: 42, email: 'shopper@example.com', name: 'Ada Lovelace', username: 'ada' });
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    // The password is WordPress's business and is not echoed back.
    expect(JSON.stringify(body)).not.toContain('hunter2!');
  });

  it('takes the identity from WordPress, never from the body', async () => {
    cookies.session = { cartToken: 'guest-cart', nonce: 'guest-nonce' };
    const wp = useWordPress([
      { method: 'POST', path: LOGIN, body: { customer: CUSTOMER } },
      { method: 'GET', path: CART_SESSION, body: { ok: true, session: null } },
      { method: 'POST', path: CART_SESSION, body: { ok: true } },
    ]);

    const res = await POST(
      post({ email: 'shopper@example.com', password: 'hunter2!', customerId: 999, id: 999 })
    );
    const body = (await res.json()) as { token: string; customer: { id: number } };

    // A body-supplied id would be an id a browser could name — and wearing another
    // shopper's cart and wishlist is exactly what that would buy.
    expect(body.customer.id).toBe(42);
    expect((await verifyCustomerSessionToken(body.token))?.cid).toBe(42);
    expect(wp.callsTo(CART_SESSION, 'POST')[0].body).toEqual({
      customerId: 42,
      cartToken: 'guest-cart',
      nonce: 'guest-nonce',
    });
  });

  it("binds this browser's cart to the account and hands the token back in a cookie", async () => {
    cookies.session = { cartToken: 'guest-cart', nonce: 'guest-nonce' };
    const wp = useWordPress([
      { method: 'POST', path: LOGIN, body: { customer: CUSTOMER } },
      { method: 'GET', path: CART_SESSION, body: { ok: true, session: null } },
      { method: 'POST', path: CART_SESSION, body: { ok: true } },
    ]);

    const res = await POST(post({ email: 'shopper@example.com', password: 'hunter2!' }));
    const body = (await res.json()) as { cart: { adopted: boolean; error: string | null } };

    expect(body.cart).toEqual({ adopted: true, merged: 0, error: null });
    expect(wp.callsTo(CART_SESSION, 'POST')[0].body).toEqual({
      customerId: 42,
      cartToken: 'guest-cart',
      nonce: 'guest-nonce',
    });
    expect(cookies.writes).toEqual([{ cartToken: 'guest-cart', nonce: 'guest-nonce' }]);
  });

  it('stays signed in when the cart binding cannot be stored', async () => {
    useWordPress([{ method: 'POST', path: LOGIN, body: { customer: CUSTOMER } }]);

    const res = await POST(post({ email: 'shopper@example.com', password: 'hunter2!' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      cart: { adopted: boolean; error: string | null };
    };
    expect(await verifyCustomerSessionToken(body.token)).not.toBeNull();
    // Reported, not fatal: the shopper keeps the cart this browser already had.
    expect(body.cart.adopted).toBe(false);
    expect(body.cart.error).toMatch(/storefront plugin is not active/);
  });
});
