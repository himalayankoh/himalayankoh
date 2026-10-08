import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/shippo/rates` is the storefront's only unauthenticated route that spends money:
 * every call is a live Shippo transaction. These tests pin the two guards that bound
 * what an anonymous caller can cost, and — just as importantly — that they do not
 * refuse the callers a checkout actually uses.
 *
 * The rate limiter and the origin allowlist are the **real** implementations here, not
 * mocks. A guard test that mocks the guard proves nothing about the deployment, and the
 * two behaviours that would break real traffic (a server-side call sending no `Origin`,
 * and a shopper's own origin) are exactly what a mock would hide.
 */

const fetchShippoRates = vi.fn();

vi.mock('@/lib/shippo/config', () => ({
  resolveShippoConfigError: async () => null,
}));

vi.mock('@/lib/shippo/packing/errors', () => ({
  UnsupportedPackingProductsError: class UnsupportedPackingProductsError extends Error {
    products: unknown[] = [];
  },
}));

vi.mock('@/lib/shippo/server/rates', () => ({ fetchShippoRates }));

const { POST } = await import('./route');

const ENDPOINT = 'https://preview.test/api/shippo/rates';

const BODY = JSON.stringify({
  address: {
    fullName: 'Ada Lovelace',
    addressLine1: '1 Analytical Way',
    city: 'Reno',
    state: 'NV',
    postalCode: '89501',
  },
  items: [{ productId: '2752', quantity: 1 }],
});

function post(headers: Record<string, string> = {}, body = BODY) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

/** The rates payload the route serialises; the shape is the lib's contract, not this file's. */
const RATES = [{ objectId: 'rate_1', amount: '12.40', provider: 'USPS' }];

beforeEach(() => {
  fetchShippoRates.mockReset().mockResolvedValue(RATES);
});

describe('POST /api/shippo/rates — who may call it', () => {
  it('refuses a browser on another site, before any Shippo call is made', async () => {
    const res = await POST(post({ origin: 'https://evil.example', 'cf-connecting-ip': '198.51.100.10' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Origin not allowed.' });
    // The point of the guard: the paid call never happens.
    expect(fetchShippoRates).not.toHaveBeenCalled();
  });

  it('allows the deployment’s own origin', async () => {
    const res = await POST(post({ origin: 'https://preview.test', 'cf-connecting-ip': '203.0.113.1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, rates: RATES });
  });

  it('allows a request with no Origin, which is what the app’s own server and scripts send', async () => {
    const res = await POST(post({ 'cf-connecting-ip': '203.0.113.2' }));

    expect(res.status).toBe(200);
    expect(fetchShippoRates).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/shippo/rates — what one caller may spend', () => {
  it('answers 429 once one address exceeds the per-minute limit', async () => {
    const ip = { 'cf-connecting-ip': '192.0.2.55' };

    // 20 is the configured limit; all of them must succeed.
    for (let i = 0; i < 20; i += 1) {
      const res = await POST(post(ip));
      expect(res.status).toBe(200);
    }

    const blocked = await POST(post(ip));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: 'Too many rate requests. Please wait a moment and try again.',
    });
    expect(blocked.headers.get('Retry-After')).toMatch(/^\d+$/);

    // The 21st call must not have reached Shippo.
    expect(fetchShippoRates).toHaveBeenCalledTimes(20);
  });

  it('gives a different address its own budget', async () => {
    for (let i = 0; i < 20; i += 1) await POST(post({ 'cf-connecting-ip': '192.0.2.77' }));
    expect((await POST(post({ 'cf-connecting-ip': '192.0.2.77' }))).status).toBe(429);

    // A second shopper is unaffected by the first one's exhaustion.
    const other = await POST(post({ 'cf-connecting-ip': '192.0.2.78' }));
    expect(other.status).toBe(200);
  });

  it('does not let a forged x-forwarded-for escape the edge address’s bucket', async () => {
    const real = '192.0.2.99';
    for (let i = 0; i < 20; i += 1) {
      await POST(post({ 'cf-connecting-ip': real, 'x-forwarded-for': `10.0.0.${i}` }));
    }

    // Rotating the client-supplied header must not multiply this caller's budget.
    const blocked = await POST(post({ 'cf-connecting-ip': real, 'x-forwarded-for': '10.0.0.250' }));
    expect(blocked.status).toBe(429);
  });
});
