import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSession } from '@/lib/auth/adminSession';
import { sealGoogleOAuthValue } from '@/lib/auth/googleOAuth';
import { searchConsoleDateRange } from '@/lib/google/searchConsole';
import { GET } from './route';

const store = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/settings/serverSettings', () => ({ getSettingsForCategoryWithStatus: store.read }));
const fetchMock = vi.fn();
const property = 'sc-domain:himalayankoh.com';
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
async function request(query = '') {
  const session = await createAdminSession({ id: '1', username: 'owner', email: 'owner@example.com', name: 'Owner' });
  return new Request(`https://himalayankoh.com/api/admin/search-console${query}`, { headers: { Authorization: `Bearer ${session.token}` } });
}
beforeEach(async () => {
  vi.stubEnv('ADMIN_SESSION_SECRET', 'search-console-test-signing-secret');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', ''); vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '');
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset();
  store.read.mockReset().mockResolvedValue({ ok: true, values: {
    client_id: 'fixture-client', client_secret: 'fixture-client-secret',
    refresh_token_encrypted: await sealGoogleOAuthValue('fixture-refresh-token', 'refresh-token'),
  } });
  fetchMock.mockResolvedValueOnce(json({ access_token: 'fixture-access-token' }))
    .mockResolvedValueOnce(json({ siteEntry: [{ siteUrl: property, permissionLevel: 'siteOwner' }] }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Search Console admin read', () => {
  it('requires admin authorization before reading settings or calling Google', async () => {
    expect((await GET(new Request('https://himalayankoh.com/api/admin/search-console'))).status).toBe(401);
    expect(store.read).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects unsupported date ranges without a provider call', async () => {
    expect((await GET(await request('?days=999999'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('distinguishes a settings outage from missing consent', async () => {
    store.read.mockResolvedValueOnce({ ok: false, values: {} });
    expect((await GET(await request())).status).toBe(503);
    store.read.mockResolvedValueOnce({ ok: true, values: { client_id: 'fixture', client_secret: 'fixture' } });
    const response = await GET(await request());
    expect(response.status).toBe(409);
    expect((await response.json()).status).toBe('AUTHORIZATION_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports a successful empty Google result as connected with no data, without invented metrics', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    const response = await GET(await request('?days=7'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.status).toBe('CONNECTED_NO_DATA'); expect(body.connected).toBe(true); expect(body.rows).toEqual([]);
    expect(body).not.toHaveProperty('totalClicks');
    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toContain(encodeURIComponent(property));
    expect(JSON.parse(options.body)).toMatchObject({ dimensions: ['query', 'page'], dataState: 'final', type: 'web' });
    expect((new URL(url)).hostname).toBe('www.googleapis.com');
  });
  it('returns real provider rows while keeping refresh and access tokens server-side', async () => {
    const row = { keys: ['pink salt', 'https://himalayankoh.com/products'], clicks: 3, impressions: 31, ctr: 3 / 31, position: 7.2 };
    fetchMock.mockResolvedValueOnce(json({ rows: [row] }));
    const response = await GET(await request()); const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ status: 'CONNECTED', rows: [row] });
    expect(text).not.toContain('fixture-access-token'); expect(text).not.toContain('fixture-refresh-token'); expect(text).not.toContain('fixture-client-secret');
  });
  it('refuses another property/account rather than silently querying a different site', async () => {
    fetchMock.mockReset().mockResolvedValueOnce(json({ access_token: 'fixture' })).mockResolvedValueOnce(json({ siteEntry: [{ siteUrl: 'https://another.example/', permissionLevel: 'siteOwner' }] }));
    const response = await GET(await request());
    expect(response.status).toBe(403); expect((await response.json()).status).toBe('PROPERTY_ACCESS_REQUIRED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('redacts sensitive provider errors and reports denied access accurately', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'fixture-private-provider-detail' } }, 403));
    const response = await GET(await request()); expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('fixture-private-provider-detail');
  });
  it('redacts token refresh failures', async () => {
    fetchMock.mockReset().mockResolvedValueOnce(json({ error: 'invalid_grant', secret: 'fixture-private-provider-detail' }, 400));
    const response = await GET(await request()); expect(response.status).toBe(409);
    expect(await response.text()).not.toContain('fixture-private-provider-detail');
  });
  it('uses the Pacific calendar across UTC date boundaries', () => {
    expect(searchConsoleDateRange(7, new Date('2026-10-10T01:00:00Z'))).toEqual({ startDate: '2026-10-02', endDate: '2026-10-08' });
  });
});
