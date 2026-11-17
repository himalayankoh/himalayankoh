import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'salman';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
});

import { createWordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

import { POST } from './route';

const realFetch = globalThis.fetch;
const VERIFY = '/hk-storefront/v1/customer/verify-email';

function post(body: unknown): Request {
  return new Request('http://localhost/api/auth/customer/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function useWordPress(routes: WordPressStubRoute[]) {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

describe('POST /api/auth/customer/verify-email', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('confirms the address and never hands back a session', async () => {
    const stub = useWordPress([
      {
        method: 'POST',
        path: VERIFY,
        body: {
          customer: {
            id: 77,
            email: 'new@example.com',
            name: 'New Shopper',
            username: 'new',
            roles: ['customer'],
            emailVerified: true,
          },
        },
      },
    ]);

    const res = await POST(post({ login: 'new@example.com', key: 'abc123' }));
    const body = (await res.json()) as {
      verified?: boolean;
      token?: string;
      customer?: { id: number; email: string; name: string };
    };

    expect(res.status).toBe(200);
    expect(body.verified).toBe(true);
    expect(body.customer).toEqual({ id: 77, email: 'new@example.com', name: 'New Shopper' });
    // Confirming is not signing in: no token may come out of this route.
    expect(body.token).toBeUndefined();
    expect(stub.callsTo(VERIFY, 'POST')[0].body).toEqual({
      login: 'new@example.com',
      key: 'abc123',
    });
  });

  it('reports an expired or wrong key without inventing success', async () => {
    useWordPress([
      {
        method: 'POST',
        path: VERIFY,
        status: 400,
        body: {
          code: 'hk_storefront_verification_invalid',
          message: 'This confirmation link is invalid or has expired.',
        },
      },
    ]);

    const res = await POST(post({ login: 'new@example.com', key: 'stale' }));
    const body = (await res.json()) as { error: string; verified?: boolean };

    expect(res.status).toBe(400);
    expect(body.verified).toBeUndefined();
    expect(body.error).toMatch(/invalid or has expired/);
  });

  it('refuses a link with no key before it calls WordPress', async () => {
    const stub = useWordPress([]);

    const res = await POST(post({ login: 'new@example.com' }));

    expect(res.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });
});
