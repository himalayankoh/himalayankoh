import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWordPressStub, type WordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.ADMIN_SESSION_SECRET = 'test-secret-that-is-long-enough-1234';
});

import { hashAdminPassword } from '@/lib/auth/adminAccounts';
import { verifyAdminSessionToken } from '@/lib/auth/adminSession';
import { GET, POST } from './route';

/** The owner's existing console login, preserved across the Supabase retirement. */
const ADMIN_EMAIL = '8002salman@gmail.com';
const ADMIN_PASSWORD = 'S3cret-pass';

let adminDigest = '';

const realFetch = globalThis.fetch;
const originalAccounts = process.env.ADMIN_LOGIN_ACCOUNTS;

beforeAll(async () => {
  adminDigest = await hashAdminPassword(ADMIN_PASSWORD);
  process.env.ADMIN_LOGIN_ACCOUNTS = `${ADMIN_EMAIL}:${adminDigest}`;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env.ADMIN_LOGIN_ACCOUNTS = `${ADMIN_EMAIL}:${adminDigest}`;
});

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

function loginRequest(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

describe('GET /api/auth/admin/login — configuration report', () => {
  it('reports both credential sources without revealing any identifier', async () => {
    const response = await GET();
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      configured: true,
      signingConfigured: true,
      loginAccountsConfigured: true,
      wordpressConfigured: true,
    });
    // An anonymous caller may learn *whether* sign-in is configured; never who.
    expect(JSON.stringify(payload)).not.toContain(ADMIN_EMAIL);
    expect(JSON.stringify(payload)).not.toContain(adminDigest);
  });
});

describe('POST /api/auth/admin/login — the owner’s configured login', () => {
  it('signs in with the same email and password the console used before', async () => {
    const wp = useWordPress([]);

    const response = await POST(loginRequest({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      token: string;
      expiresAt: number;
      user: { id: string; email: string; name: string; role: string };
    };

    expect(payload.user).toMatchObject({
      id: ADMIN_EMAIL,
      email: ADMIN_EMAIL,
      name: ADMIN_EMAIL,
      role: 'admin',
    });
    expect(payload.expiresAt).toBeGreaterThan(Date.now());

    // The token is what every admin route will accept.
    const session = await verifyAdminSessionToken(payload.token);
    expect(session?.username).toBe(ADMIN_EMAIL);
    expect(session?.role).toBe('admin');

    // A configured login needs no WordPress round trip, so the console stays
    // reachable when WordPress is down.
    expect(wp.calls).toHaveLength(0);
  });

  it('accepts the identifier case-insensitively', async () => {
    useWordPress([]);

    const response = await POST(
      loginRequest({ username: '8002SALMAN@GMAIL.COM', password: ADMIN_PASSWORD })
    );

    expect(response.status).toBe(200);
  });

  it('rejects a wrong password with a 401, not a deployment error', async () => {
    // WordPress is configured in this file, so a non-matching identifier falls
    // through to it; it refuses the (invalid) application password.
    useWordPress([
      {
        path: '/wp/v2/users/me',
        status: 401,
        body: { code: 'incorrect_password', message: 'The provided password is an invalid application password.' },
      },
    ]);

    const response = await POST(loginRequest({ username: ADMIN_EMAIL, password: 'wrong' }));

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: string };
    // Never 503: a mistyped password must not read as a broken deployment.
    expect(payload.error).not.toMatch(/not configured/i);
  });

  it('never echoes the password back in a response', async () => {
    useWordPress([]);

    const response = await POST(loginRequest({ username: ADMIN_EMAIL, password: 'wrong-password' }));

    expect(await response.text()).not.toContain('wrong-password');
  });
});

describe('POST /api/auth/admin/login — WordPress administrators', () => {
  it('signs in a WordPress administrator when no configured account matches', async () => {
    useWordPress([
      {
        path: '/wp/v2/users/me',
        body: {
          id: 12,
          name: 'Salman',
          slug: 'salman',
          email: 'salman@himalayankoh.com',
          roles: ['administrator'],
        },
      },
    ]);

    const response = await POST(loginRequest({ username: 'salman', password: 'abcd EFGH ijkl' }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { token: string; user: { id: string; username: string } };
    expect(payload.user).toMatchObject({ id: '12', username: 'salman' });

    const session = await verifyAdminSessionToken(payload.token);
    expect(session?.sub).toBe('12');
  });

  it('refuses a WordPress account that is not an administrator', async () => {
    useWordPress([{ path: '/wp/v2/users/me', body: { id: 3, slug: 'editor', roles: ['editor'] } }]);

    const response = await POST(loginRequest({ username: 'editor', password: 'abcd EFGH ijkl' }));

    expect(response.status).toBe(403);
  });

  it('answers 401 without blaming the wrong credential source', async () => {
    useWordPress([
      {
        path: '/wp/v2/users/me',
        status: 401,
        body: { code: 'incorrect_password', message: 'The provided password is an invalid application password.' },
      },
    ]);

    const response = await POST(loginRequest({ username: 'unknown-user', password: 'nope' }));

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: string };
    // Configured accounts are also in play here, so the message covers both
    // sources rather than sending the typo back to WordPress's wording.
    expect(payload.error).toBe('Wrong email/username or password.');
  });
});

describe('POST /api/auth/admin/login — guards', () => {
  it('rejects a malformed body', async () => {
    const response = await POST(loginRequest('not json', true));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body.' });
  });

  it('requires both fields', async () => {
    const response = await POST(loginRequest({ username: ADMIN_EMAIL }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Enter your email/username and password.' });
  });

  it('reports a 503 when the signing key is missing', async () => {
    const secret = process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;

    try {
      const response = await POST(loginRequest({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD }));
      expect(response.status).toBe(503);
      const payload = (await response.json()) as { error: string };
      expect(payload.error).toMatch(/ADMIN_SESSION_SECRET/);
    } finally {
      process.env.ADMIN_SESSION_SECRET = secret;
    }
  });

  it('rate-limits repeated attempts against the same identifier', async () => {
    useWordPress([]);
    // A unique identifier keeps this test off the counter the others share.
    const identifier = 'rate-limit-probe@example.com';

    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await POST(loginRequest({ username: identifier, password: 'wrong' }));
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
  });
});
