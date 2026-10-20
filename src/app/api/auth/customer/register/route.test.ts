import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'salman';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
});

import {
  createWordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

import { POST } from './route';

const realFetch = globalThis.fetch;

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/auth/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function useWordPress(routes: WordPressStubRoute[]) {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

/**
 * The unconfigured branch is the whole of this file's scope, and it is deliberately the
 * first thing the route does: it refuses before reading a body or touching a cookie, so
 * the assertion needs no stubs. What is checked is the **response body**, because
 * sign-up is reachable by a stranger and the sentence it used to answer with named the
 * environment variable this deployment was missing.
 */
describe('POST /api/auth/customer/register', () => {
  afterEach(() => {
    delete process.env.CUSTOMER_SESSION_SECRET;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('fails closed when the deployment has no signing key, without naming it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.CUSTOMER_SESSION_SECRET;

    const res = await POST(post({ email: 'new@example.com', password: 'hunter2!' }));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(503);
    expect(body.error).not.toMatch(/CUSTOMER_SESSION_SECRET/);
    expect(body.error).toBe(
      'Customer account creation is temporarily unavailable. Please try again in a few minutes, or email sales@himalayankoh.com and we will help you directly.'
    );
    expect(logged.mock.calls.flat().join(' ')).toMatch(/CUSTOMER_SESSION_SECRET/);
  });

  it("answers the shopper with the store's durable rate limit, and tells WordPress whose attempt it was", async () => {
    process.env.CUSTOMER_SESSION_SECRET = 'a-test-secret-long-enough-to-sign';
    const stub = useWordPress([
      {
        method: 'POST',
        path: '/hk-storefront/v1/customer/register',
        status: 429,
        body: {
          code: 'hk_storefront_signup_rate_limited',
          message: 'Too many accounts have been created from this connection.',
        },
      },
    ]);

    // `cf-connecting-ip` is what the edge sets and a caller cannot forge, so it is the
    // address the durable budget is keyed by — not the `x-forwarded-for` beside it.
    const res = await POST(
      post(
        { email: 'new-shopper@himalayankoh.com', password: 'hunter2!' },
        { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.7' }
      )
    );
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(body.error).toBe(
      'Too many accounts have been created from this connection. Please try again later, or email sales@himalayankoh.com and we will help you directly.'
    );
    const [call] = stub.callsTo('/hk-storefront/v1/customer/register', 'POST');
    expect(call.headers['X-HK-Client-IP']).toBe('203.0.113.9');
  });
});
