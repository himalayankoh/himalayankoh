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
  it('can request Search Console read access without AdSense permissions', async () => {
    const session = await createAdminSession({ id: '1', username: 'owner', email: 'owner@example.com', name: 'Owner' });
    const response = await start(new Request(`${ORIGIN}/api/admin/google-auth?service=search-console`, { headers: { Authorization: `Bearer ${session.token}` } }));
    const body = await response.json();
    expect(new URL(body.authUrl).searchParams.get('scope')).toBe('https://www.googleapis.com/auth/webmasters.readonly');
  });
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
    expect(typeof fetchMock.mock.calls[0][1].body).toBe('string');
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('code_verifier')).toHaveLength(43);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')!));
    expect(Buffer.from(digest).toString('base64url')).toBe(url.searchParams.get('code_challenge'));
    expect(body.get('redirect_uri')).toBe(url.searchParams.get('redirect_uri'));
    expect(body.get('client_id')).toBe(url.searchParams.get('client_id'));
    expect(body.get('grant_type')).toBe('authorization_code');
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
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('provider-private-detail');
    expect(body.providerCode).toBe('invalid_grant');
    expect(body.error).toContain('do not reload the callback');
    expect(settings.write).not.toHaveBeenCalled();
  });
  it.each(['invalid_client', 'unauthorized_client', 'redirect_uri_mismatch', 'untrusted-private-payload'])('reports only safe exchange diagnostics for %s', async error => {
    const { cookie, url } = await begin();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error, error_description: 'private credential detail' }, { status: 400 })));
    const response = await callback(returning(cookie, url.searchParams.get('state')!));
    const body = await response.json();
    expect(body.providerCode).toBe(error === 'untrusted-private-payload' ? 'token_exchange_failed' : error);
    expect(JSON.stringify(body)).not.toContain('private credential detail');
    expect(JSON.stringify(body)).not.toContain('untrusted-private-payload');
    expect(settings.write).not.toHaveBeenCalled();
  });
  it.each([
    ['Invalid code_verifier.', 'pkce_rejected'],
    ['Redirect URI does not match.', 'callback_mismatch'],
    ['Authorization code expired.', 'code_expired'],
    ['Code was already redeemed.', 'code_already_used'],
    ['Malformed auth code.', 'code_malformed'],
    ['private-secret-description', 'code_rejected'],
  ])('classifies %s without forwarding provider detail', async (description, reason) => {
    const { cookie, url } = await begin();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'invalid_grant', error_description: description }, { status: 400 })));
    const response = await callback(returning(cookie, url.searchParams.get('state')!));
    const body = await response.json();
    expect(body.reason).toBe(reason);
    expect(JSON.stringify(body)).not.toContain(description);
    expect(settings.write).not.toHaveBeenCalled();
  });
  it('preserves the exact decoded authorization code in the form body', async () => {
    const { cookie, url } = await begin();
    const code = '4/fixture+code=%value';
    const query = new URLSearchParams({ code, state: url.searchParams.get('state')! });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await callback(new NextRequest(`${ORIGIN}/api/admin/google-auth/callback?${query}`, { headers: { Cookie: `${GOOGLE_OAUTH_COOKIE}=${cookie}` } }));
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('code')).toBe(code);
  });
});
