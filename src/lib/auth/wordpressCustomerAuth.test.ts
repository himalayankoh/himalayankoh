import { afterEach, describe, expect, it, vi } from 'vitest';
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

import { createWordPressCustomer, verifyWordPressCustomerCredentials } from './wordpressCustomerAuth';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

const CUSTOMER = {
  id: 42,
  email: 'Shopper@Example.com',
  name: 'Ada Lovelace',
  username: 'ada',
  roles: ['customer'],
};

describe('WordPress customer authentication', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env.WORDPRESS_ADMIN_USER = 'salman';
    process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
  });

  it('verifies the shopper in WordPress and returns their WooCommerce customer id', async () => {
    const wp = useWordPress([
      { method: 'POST', path: '/hk-storefront/v1/customer/login', body: { customer: CUSTOMER } },
    ]);

    const result = await verifyWordPressCustomerCredentials('Shopper@Example.com', 'hunter2!');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.customer.id).toBe(42);
    expect(result.customer.email).toBe('shopper@example.com');
    expect(result.customer.username).toBe('ada');

    // The password is passed through to WordPress, which is the only place the
    // hash lives — and the app authenticates there as an administrator.
    const [call] = wp.callsTo('/hk-storefront/v1/customer/login', 'POST');
    expect(call.body).toEqual({ login: 'Shopper@Example.com', password: 'hunter2!' });
    expect(call.headers.Authorization).toBe(
      `Basic ${Buffer.from('salman:abcdEFGHijklMNOPqrstUVWX').toString('base64')}`
    );
  });

  it('reports a wrong password as a credential refusal, not a plugin problem', async () => {
    useWordPress([
      {
        method: 'POST',
        path: '/hk-storefront/v1/customer/login',
        status: 401,
        body: { code: 'hk_storefront_invalid_credentials', message: 'Wrong email or password.' },
      },
    ]);

    const result = await verifyWordPressCustomerCredentials('shopper@example.com', 'nope');

    expect(result).toEqual({ ok: false, status: 401, error: 'Wrong email or password.' });
  });

  it('names the plugin when the route does not exist, rather than blaming the password', async () => {
    useWordPress([]);

    const result = await verifyWordPressCustomerCredentials('shopper@example.com', 'hunter2!');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(result.error).toMatch(/storefront plugin is not active/);
  });

  it('reports a refused app credential without naming the configuration to the shopper', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    useWordPress([
      {
        method: 'POST',
        path: '/hk-storefront/v1/customer/login',
        status: 401,
        body: { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' },
      },
    ]);

    const result = await verifyWordPressCustomerCredentials('shopper@example.com', 'hunter2!');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
    // This is the unauthenticated sign-in surface, and it used to hand a stranger the
    // two variables the Worker was missing. The operator still gets the note — in the
    // log, where its audience reads it.
    expect(result.error).not.toMatch(/WORDPRESS_ADMIN/);
    expect(result.error).toMatch(/temporarily unavailable/);
    expect(logged.mock.calls.flat().join(' ')).toMatch(/WORDPRESS_ADMIN_USER/);
    logged.mockRestore();
  });

  it('fails closed, and quietly, when the app has no WordPress credential at all', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.WORDPRESS_ADMIN_USER;
    delete process.env.WORDPRESS_ADMIN_APP_PASSWORD;

    const result = await verifyWordPressCustomerCredentials('shopper@example.com', 'hunter2!');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(result.error).not.toMatch(/WORDPRESS_ADMIN/);
    expect(result.error).toMatch(/temporarily unavailable/);
    expect(logged.mock.calls.flat().join(' ')).toMatch(/WORDPRESS_ADMIN_USER/);
    logged.mockRestore();
  });

  it('refuses an empty credential without asking WordPress', async () => {
    const wp = useWordPress([
      { method: 'POST', path: '/hk-storefront/v1/customer/login', body: { customer: CUSTOMER } },
    ]);

    expect(await verifyWordPressCustomerCredentials('', 'hunter2!')).toEqual({
      ok: false,
      status: 400,
      error: 'Enter your email or username and your password.',
    });
    expect(await verifyWordPressCustomerCredentials('shopper@example.com', '')).toEqual({
      ok: false,
      status: 400,
      error: 'Enter your email or username and your password.',
    });
    expect(wp.calls).toHaveLength(0);
  });

  it('refuses a 200 that carries no customer id', async () => {
    useWordPress([
      { method: 'POST', path: '/hk-storefront/v1/customer/login', body: { customer: { id: 'abc' } } },
    ]);

    const result = await verifyWordPressCustomerCredentials('shopper@example.com', 'hunter2!');

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: 'WordPress verified the credential but returned no customer id.',
    });
  });

  it('creates a customer through the plugin and returns the new customer id', async () => {
    const wp = useWordPress([
      {
        method: 'POST',
        path: '/hk-storefront/v1/customer/register',
        body: { customer: { ...CUSTOMER, id: 43, username: 'newshopper' } },
      },
    ]);

    const result = await createWordPressCustomer({
      email: 'new@example.com',
      password: 'hunter2!',
      name: 'New Shopper',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.customer.id).toBe(43);
    expect(wp.callsTo('/hk-storefront/v1/customer/register', 'POST')[0].body).toEqual({
      email: 'new@example.com',
      password: 'hunter2!',
      name: 'New Shopper',
    });
  });

  it("surfaces the plugin's own refusal when the email is taken", async () => {
    useWordPress([
      {
        method: 'POST',
        path: '/hk-storefront/v1/customer/register',
        status: 409,
        body: { code: 'hk_storefront_email_taken', message: 'That email is already registered.' },
      },
    ]);

    expect(
      await createWordPressCustomer({ email: 'taken@example.com', password: 'hunter2!' })
    ).toEqual({
      ok: false,
      status: 409,
      error: 'An account already exists for this email. Sign in instead.',
    });
  });

  it('requires an email before creating anything', async () => {
    const wp = useWordPress([]);

    expect(await createWordPressCustomer({ email: '  ', password: 'hunter2!' })).toEqual({
      ok: false,
      status: 400,
      error: 'Enter your email address.',
    });
    expect(wp.calls).toHaveLength(0);
  });
});
