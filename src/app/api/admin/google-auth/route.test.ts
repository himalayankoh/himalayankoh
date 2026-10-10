import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSession } from '@/lib/auth/adminSession';
import { createGoogleOAuthTransaction, GOOGLE_OAUTH_COOKIE, openGoogleOAuthValue } from '@/lib/auth/googleOAuth';
import { GET as start } from './route';
import { GET as callback } from './callback/route';

const settings = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/settings/serverSettings', () => ({ getSettingsForCategory: settings.read, upsertSettings: settings.write }));
const ORIGIN = 'https://himalayankoh.com';

beforeEach(() => {
  vi.stubEnv('ADMIN_SESSION_SECRET', 'google-oauth-test-signing-secret-only');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '');
  settings.read.mockReset().mockResolvedValue({ client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-client-secret' });
  settings.write.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function begin() {
  const session = await createAdminSession({ id: '1', username: 'owner', email: 'owner@example.com', name: 'Owner' });
  const response = await start(new Request(`${ORIGIN}/api/admin/google-auth`, { headers: { Authorization: `Bearer ${session.token}` } }));
  const body = await response.json();
  return { response, url: new URL(body.authUrl), cookie: response.cookies.get(GOOGLE_OAUTH_COOKIE)!.value };
}
function returning(cookie: string, state: string) {
  return new NextRequest(`${ORIGIN}/api/admin/google-auth/callback?code=fixture-code&state=${state}`, { headers: { Cookie: `${GOOGLE_OAUTH_COOKIE}=${cookie}` } });
}

describe('admin Google authorization', () => {
  it('refuses an anonymous start before reading credentials', async () => {
    const response = await start(new Request(`${ORIGIN}/api/admin/google-auth`));
    expect(response.status).toBe(401);
    expect(settings.read).not.toHaveBeenCalled();
  });
  it('binds authorization to a secure, short-lived browser transaction and PKCE', async () => {
    const { response, url } = await begin();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('webmasters.readonly');
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(response.headers.get('set-cookie')).toMatch(/Secure/i);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects missing, mismatched and altered transactions without token exchange', async () => {
    const { cookie, url } = await begin();
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const request of [returning('', url.searchParams.get('state')!), returning(cookie, 'attacker-state'), returning(cookie + '.altered', url.searchParams.get('state')!)]) {
      expect((await callback(request)).status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(settings.write).not.toHaveBeenCalled();
  });
  it('rejects a callback carrying an invalid admin session even with a matching transaction', async () => {
    const transaction = await createGoogleOAuthTransaction('invalid-admin-token', ORIGIN);
    expect((await callback(returning(transaction.cookie, transaction.state))).status).toBe(401);
    expect(settings.write).not.toHaveBeenCalled();
  });
  it('rejects an expired transaction', async () => {
    vi.useFakeTimers();
    const { cookie, url } = await begin();
    vi.advanceTimersByTime(601_000);
    expect((await callback(returning(cookie, url.searchParams.get('state')!))).status).toBe(403);
  });
  it('exchanges a valid code with PKCE and persists only an encrypted refresh token', async () => {
    const { cookie, url } = await begin();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ refresh_token: 'fixture-refresh-token', access_token: 'fixture-access-token' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await callback(returning(cookie, url.searchParams.get('state')!));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/admin/settings?google=connected`);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('code_verifier')).toHaveLength(43);
    const stored = settings.write.mock.calls[0][1];
    expect(stored.refresh_token).toBeUndefined();
    expect(stored.refresh_token_encrypted).not.toContain('fixture-refresh-token');
    expect(await openGoogleOAuthValue(stored.refresh_token_encrypted, 'refresh-token')).toBe('fixture-refresh-token');
    expect(await openGoogleOAuthValue(stored.refresh_token_encrypted, 'transaction')).toBeNull();
  });
  it('does not forward sensitive provider errors or persist tokens from a failed exchange', async () => {
    const { cookie, url } = await begin();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant', secret: 'provider-private-detail' }), { status: 400 })));
    const response = await callback(returning(cookie, url.searchParams.get('state')!));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('provider-private-detail');
    expect(settings.write).not.toHaveBeenCalled();
  });
});
