import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPressStub, type WordPressStub, type WordPressStubRoute } from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
});

import { isWordPressAuthConfigured, verifyWordPressAdminCredentials } from './wordpressAdminAuth';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

describe('WordPress administrator authentication', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('knows WordPress is configured for this deployment', () => {
    expect(isWordPressAuthConfigured()).toBe(true);
  });

  it('accepts an administrator and returns the WordPress identity', async () => {
    useWordPress([
      {
        path: '/wp/v2/users/me',
        body: {
          id: 7,
          name: 'Salman Bashir',
          slug: 'salman',
          email: 'salman@himalayankoh.com',
          roles: ['administrator'],
        },
      },
    ]);

    const result = await verifyWordPressAdminCredentials('salman', 'abcd EFGH ijkl MNOP qrst UVWX');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toEqual({
      id: '7',
      username: 'salman',
      email: 'salman@himalayankoh.com',
      name: 'Salman Bashir',
      roles: ['administrator'],
    });
  });

  it('sends the application password with its display spaces stripped', async () => {
    const wp = useWordPress([{ path: '/wp/v2/users/me', body: { id: 1, roles: ['administrator'] } }]);

    await verifyWordPressAdminCredentials('salman', 'abcd EFGH ijkl');

    const [call] = wp.callsTo('/wp/v2/users/me', 'GET');
    expect(call.headers.Authorization).toBe(
      `Basic ${Buffer.from('salman:abcdEFGHijkl').toString('base64')}`
    );
    // `context=edit` is what makes WordPress return `roles` at all.
    expect(call.query.get('context')).toBe('edit');
  });

  it('refuses an account that is not an administrator, naming its roles', async () => {
    useWordPress([
      {
        path: '/wp/v2/users/me',
        body: { id: 9, slug: 'editor', roles: ['editor', 'subscriber'] },
      },
    ]);

    const result = await verifyWordPressAdminCredentials('editor', 'abcd EFGH ijkl');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/editor, subscriber/);
  });

  it('treats a role comparison case-insensitively', async () => {
    useWordPress([
      { path: '/wp/v2/users/me', body: { id: 1, slug: 'boss', roles: ['Administrator'] } },
    ]);

    await expect(verifyWordPressAdminCredentials('boss', 'pw')).resolves.toMatchObject({ ok: true });
  });

  it('reports a wrong credential as a 401', async () => {
    useWordPress([
      {
        path: '/wp/v2/users/me',
        status: 401,
        body: { code: 'incorrect_password', message: 'The provided password is an invalid application password.' },
      },
    ]);

    const result = await verifyWordPressAdminCredentials('salman', 'nope');

    expect(result).toMatchObject({ ok: false, status: 401 });
    if (!result.ok) expect(result.error).toMatch(/Wrong WordPress username or application password/);
  });

  it('explains that application passwords are switched off, as a 503', async () => {
    useWordPress([
      {
        path: '/wp/v2/users/me',
        status: 401,
        body: { code: 'application_passwords_disabled', message: 'Application passwords are not available.' },
      },
    ]);

    const result = await verifyWordPressAdminCredentials('salman', 'nope');

    expect(result).toMatchObject({ ok: false, status: 503 });
    if (!result.ok) expect(result.error).toMatch(/Users → Profile/);
  });

  it('requires both halves of the credential before calling WordPress', async () => {
    const wp = useWordPress([]);

    await expect(verifyWordPressAdminCredentials('', 'pw')).resolves.toMatchObject({ status: 400 });
    await expect(verifyWordPressAdminCredentials('salman', '')).resolves.toMatchObject({ status: 400 });
    await expect(verifyWordPressAdminCredentials('   ', '   ')).resolves.toMatchObject({ status: 400 });
    expect(wp.calls).toHaveLength(0);
  });

  it('reports a broken endpoint as a 502 rather than as bad credentials', async () => {
    useWordPress([
      { path: '/wp/v2/users/me', status: 500, raw: '<br /><b>Fatal error</b>: Uncaught Error' },
    ]);

    const result = await verifyWordPressAdminCredentials('salman', 'abcd EFGH ijkl');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
    // A server fault must not read as "wrong password" — that sends the owner
    // hunting for a credential problem that does not exist.
    expect(result.error).not.toMatch(/Wrong WordPress username/);
  });
});
