import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WORDPRESS_ADMIN_USER = 'salman';
  process.env.WORDPRESS_ADMIN_APP_PASSWORD = 'abcdEFGHijklMNOPqrstUVWX';
});

import { createWordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

import { POST } from './route';

const realFetch = globalThis.fetch;
const RESEND = '/hk-storefront/v1/customer/resend-verification';

function post(body: unknown): Request {
  return new Request('http://localhost/api/auth/customer/resend-verification', {
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

const GENERIC =
  'If that account still needs confirming, we have sent a new link. Check your inbox and spam folder.';

describe('POST /api/auth/customer/resend-verification', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('forwards the identifier and answers one sentence for a waiting account', async () => {
    const stub = useWordPress([{ method: 'POST', path: RESEND, body: { ok: true } }]);

    const res = await POST(post({ login: 'shopper@example.com' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: GENERIC });
    expect(stub.callsTo(RESEND, 'POST')[0].body).toMatchObject({ login: 'shopper@example.com' });
  });

  it('is byte-identical for an unknown address, so no field says whether mail went out', async () => {
    useWordPress([{ method: 'POST', path: RESEND, body: { ok: true } }]);

    const known = await POST(post({ login: 'shopper@example.com' }));
    const unknown = await POST(post({ login: 'nobody@example.com' }));

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("surfaces WordPress's cooldown instead of sending a second message", async () => {
    useWordPress([
      {
        method: 'POST',
        path: RESEND,
        status: 429,
        body: {
          code: 'hk_storefront_verification_throttled',
          message: 'A confirmation email was just sent.',
        },
      },
    ]);

    const res = await POST(post({ login: 'shopper@example.com' }));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/wait|limit/i);
  });

  it('refuses an empty identifier before it calls WordPress', async () => {
    const stub = useWordPress([]);

    const res = await POST(post({ login: '   ' }));

    expect(res.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });
});
