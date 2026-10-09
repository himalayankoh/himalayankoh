import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'salman';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
});

import { POST } from './route';

function post(body: unknown): Request {
  return new Request('http://localhost/api/auth/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
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
});
