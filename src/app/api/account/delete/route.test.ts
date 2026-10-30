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
  process.env.CUSTOMER_SESSION_SECRET = 'customer-secret-long-enough-to-sign';
  process.env.ADMIN_SESSION_SECRET = 'admin-secret-long-enough-to-sign-too';
});

const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));

import { POST } from './route';
import { createCustomerSession } from '@/lib/auth/customerSession';
import { createAdminSession } from '@/lib/auth/adminSession';

const realFetch = globalThis.fetch;

const EMAIL = 'shopper@example.com';
const CUSTOMER_ID = 42;

/** A real session token for the customer, minted the way the login route mints one. */
async function customerToken(): Promise<string> {
  const { token } = await createCustomerSession({ customerId: CUSTOMER_ID, email: EMAIL, name: 'Ada' });
  return token;
}

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

/** The plugin route the password re-check goes through. */
function pluginRoutes(passwordAccepted: boolean, email = EMAIL): WordPressStubRoute[] {
  return [
    {
      method: 'POST',
      path: '/hk-storefront/v1/customer/login',
      status: passwordAccepted ? 200 : 401,
      body: passwordAccepted
        ? { customer: { id: CUSTOMER_ID, email, name: 'Ada', username: 'ada', roles: ['customer'] } }
        : { code: 'hk_storefront_invalid_credentials', message: 'Wrong email or password.' },
    },
  ];
}

function makeRequest(body: unknown, opts: { bearer?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`;
  return new Request('http://localhost/api/account/delete', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    checkRateLimit.mockReset().mockReturnValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('requires a session, and says the same thing however it is missing', async () => {
    for (const bearer of [undefined, '', 'not-a-token']) {
      const res = await POST(makeRequest({ email: EMAIL, password: 'pw' }, { bearer }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Sign in to your account to continue.' });
    }
  });

  it('refuses an administrator session', async () => {
    const { token } = await createAdminSession({
      id: '7',
      username: 'salman',
      email: 'salman@himalayankoh.com',
      name: 'Salman Bashir',
    });

    const res = await POST(makeRequest({ email: EMAIL, password: 'pw' }, { bearer: token }));

    expect(res.status).toBe(401);
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(makeRequest('nope', { bearer: await customerToken() }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body.' });
  });

  it('requires both email and password', async () => {
    const res = await POST(makeRequest({}, { bearer: await customerToken() }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Email and password are required.' });
  });

  it('rejects an email that is not the signed-in customer', async () => {
    const wp = useWordPress(pluginRoutes(true));

    const res = await POST(
      makeRequest({ email: 'someone.else@example.com', password: 'pw' }, { bearer: await customerToken() })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Email does not match this account.' });
    // The password is never even checked for an account that is not the caller's.
    expect(wp.calls).toHaveLength(0);
  });

  it('re-checks the password in WordPress and refuses a wrong one', async () => {
    useWordPress(pluginRoutes(false));

    const res = await POST(
      makeRequest({ email: EMAIL, password: 'wrong' }, { bearer: await customerToken() })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Wrong email or password.' });
  });

  it('reports the missing WordPress route honestly once authorised', async () => {
    const wp = useWordPress(pluginRoutes(true));

    const res = await POST(
      makeRequest({ email: EMAIL, password: 'correct' }, { bearer: await customerToken() })
    );

    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/hk-storefront\/v1\/customer\/delete/);
    // Depended on the WordPress half rather than pretending: the password check ran,
    // and nothing deleted anything.
    expect(wp.callsTo('/hk-storefront/v1/customer/login', 'POST')).toHaveLength(1);
  });

  it('rate limits repeated attempts', async () => {
    checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

    const res = await POST(makeRequest({ email: EMAIL, password: 'pw' }, { bearer: 'any' }));

    expect(res.status).toBe(429);
  });
});
