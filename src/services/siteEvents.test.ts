import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock('./wordpressAdminAuth', () => ({ getFreshAccessToken: auth.token }));
import { recordSiteEvent, fetchSiteEvents } from './siteEvents';

describe('storefront traffic privacy and backend reads', () => {
  const send = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/products/salt', search: '?client_secret=private&category=salt', origin: 'https://himalayankoh.com' } });
    vi.stubGlobal('document', { referrer: 'https://example.com/private?token=secret' });
    vi.stubGlobal('navigator', { userAgent: 'Desktop' });
    vi.stubGlobal('localStorage', { getItem: () => 'visitor', setItem: vi.fn() });
    vi.stubGlobal('sessionStorage', { getItem: () => 'session', setItem: vi.fn() });
    vi.stubGlobal('fetch', send);
    send.mockReset().mockResolvedValue(new Response('{}'));
    auth.token.mockReset().mockResolvedValue('test-admin-session');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('records a real public view through the existing same-origin API without private URL values', () => {
    recordSiteEvent('page_view');
    const [url, request] = send.mock.calls[0];
    expect(url).toBe('/api/events');
    expect(request.keepalive).toBe(true);
    expect(JSON.parse(request.body)).toMatchObject({ event: 'page_view', path: '/products/salt', referrer: 'https://example.com', visitor_id: 'visitor', session_id: 'session' });
    expect(request.body).not.toMatch(/client_secret|private|secret/);
  });
  it.each(['/admin', '/admin/settings', '/account', '/api/admin/google-auth/callback', '/track', '/orders', '/login'])('excludes private route %s', path => {
    window.location.pathname = path;
    recordSiteEvent('page_view');
    expect(send).not.toHaveBeenCalled();
  });
  it('never throws when the beacon fails', () => {
    send.mockRejectedValue(new Error('Network down'));
    expect(() => recordSiteEvent('page_view')).not.toThrow();
  });
  it('does not count local or preview traffic in production', () => {
    window.location.origin = 'http://localhost:3335';
    recordSiteEvent('page_view');
    window.location.origin = 'https://preview.himalayankoh.com';
    recordSiteEvent('page_view');
    expect(send).not.toHaveBeenCalled();
  });
  it('preserves partial-window status and interprets WordPress UTC timestamps correctly', async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ events: [{ event: 'page_view', occurred_at: '2026-10-10 09:00:00' }], truncated: true })));
    const result = await fetchSiteEvents(30);
    expect(result.truncated).toBe(true);
    expect(result.events[0].occurred_at).toBe('2026-10-10T09:00:00Z');
    expect(send.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { Authorization: 'Bearer test-admin-session' } });
  });
  it('does not query traffic without an admin session', async () => {
    auth.token.mockResolvedValue(null);
    await expect(fetchSiteEvents()).rejects.toThrow('Sign in');
    expect(send).not.toHaveBeenCalled();
  });
});
