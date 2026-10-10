import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ token: vi.fn(), auth: vi.fn(), settings: vi.fn() }));
vi.mock('./searchConsole', () => ({ googleAccessToken: mocks.token, SearchConsoleError: class extends Error {} }));
vi.mock('@/lib/auth/verifyAdminRequest', () => ({ verifyAdminRequest: mocks.auth }));
vi.mock('@/lib/settings/serverSettings', () => ({ getSettingsForCategoryWithStatus: mocks.settings }));
import { adSenseFailure, parseAdSenseReport, previousAdSenseMonth, readAdSenseConnection } from './adsense';
import { GET as earnings } from '@/app/api/adsense/earnings/route';
import { GET as status } from '@/app/api/adsense/status/route';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const names = ['ESTIMATED_EARNINGS', 'PAGE_VIEWS', 'IMPRESSIONS', 'CLICKS', 'PAGE_VIEWS_RPM', 'IMPRESSIONS_RPM'];
const report = { headers: names.map(name => ({ name, currencyCode: 'USD' })), totals: { cells: ['1.25','20','30','2','62.5','41.67'].map(value => ({ value })) } };

describe('AdSense genuine reporting', () => {
  it('maps values by header names and preserves genuine zero earnings', () => {
    const parsed = parseAdSenseReport(report);
    expect(parsed.currency).toBe('USD');
    expect(parsed.values).toEqual({ earnings: 1.25, pageViews: 20, impressions: 30, clicks: 2, pageRpm: 62.5, impressionRpm: 41.67 });
    expect(parseAdSenseReport({ ...report, totals: { cells: names.map(() => ({ value: '0' })) } }).values.earnings).toBe(0);
  });
  it('does not turn missing, invalid, or currency-less reports into fabricated zeros', () => {
    expect(() => parseAdSenseReport({})).toThrow('no report totals');
    expect(() => parseAdSenseReport({ ...report, totals: { cells: [{ value: 'bad' }] } })).toThrow('incomplete report');
    expect(() => parseAdSenseReport({ ...report, headers: names.map(name => ({ name })) })).toThrow('currency');
  });
  it('uses CUSTOM for the previous calendar month in the publisher timezone', () => {
    const range = previousAdSenseMonth('America/Los_Angeles', new Date('2026-01-01T01:00:00Z'));
    expect(range.get('dateRange')).toBe('CUSTOM');
    expect(range.get('startDate.year')).toBe('2025');
    expect(range.get('startDate.month')).toBe('11');
    expect(range.get('endDate.day')).toBe('30');
  });
  it('requires access to the exact configured publisher, not an arbitrary first account', async () => {
    mocks.token.mockResolvedValue('test-provider-token');
    const fetch = vi.fn().mockResolvedValue(Response.json({ accounts: [{ name: 'accounts/pub-other' }] }));
    vi.stubGlobal('fetch', fetch);
    await expect(readAdSenseConnection()).rejects.toThrow('configured AdSense publisher');
  });
  it('redacts unrecognized provider errors', () => {
    expect(adSenseFailure(new Error('private provider token'))).toEqual({ status: 502, code: 'GOOGLE_API_ERROR', message: 'Google AdSense could not be read. Try again.' });
  });
  it.each([earnings, status])('denies unauthenticated reads before reaching settings or Google', async handler => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, error: 'Admin authentication required.' });
    const response = await handler(new Request('https://himalayankoh.com/api/adsense/status'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
});
