import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The public catalogue route is the one storefront read the framework cannot
 * cache: it reads its own query string, so the response is always `BYPASS` and
 * every request reaches the Worker. The read *behind* it is cached instead, and
 * these tests hold that arrangement to its promises:
 *
 *  - a repeat of the same public read makes one origin call between them;
 *  - two different shelves never share an entry;
 *  - a search, a degraded read and a failed lookup are answered but never stored,
 *    so a moment of origin trouble cannot be pinned for a window;
 *  - nothing this route returns is labelled publicly cacheable, because a shared
 *    cache must never hold a response for a route that reads the request.
 */

const getCatalogProducts = vi.fn();
const getFeaturedCatalogProducts = vi.fn();
const lookupCatalogProduct = vi.fn();

vi.mock('@/lib/backend/serverCatalog', () => ({
  getCatalogProducts: (...args: unknown[]) => getCatalogProducts(...args),
  getFeaturedCatalogProducts: (...args: unknown[]) => getFeaturedCatalogProducts(...args),
  lookupCatalogProduct: (...args: unknown[]) => lookupCatalogProduct(...args),
}));

const { GET } = await import('./route');
const { __resetPublicReadCache } = await import('@/lib/backend/publicReadCache');

const listResult = (overrides: Record<string, unknown> = {}) => ({
  products: [],
  count: 0,
  degraded: false,
  warnings: [],
  ...overrides,
});

const request = (query = '') => new NextRequest(`https://preview.test/api/catalog${query}`);

beforeEach(() => {
  getCatalogProducts.mockReset();
  getFeaturedCatalogProducts.mockReset();
  lookupCatalogProduct.mockReset();
  getCatalogProducts.mockResolvedValue(listResult());
  getFeaturedCatalogProducts.mockResolvedValue([]);
  lookupCatalogProduct.mockResolvedValue({ product: null, related: [], provenance: null, error: null });
  __resetPublicReadCache();
});

describe('GET /api/catalog origin shield', () => {
  it('reads the origin once for two identical public reads', async () => {
    const first = await GET(request());
    const second = await GET(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(getCatalogProducts).toHaveBeenCalledTimes(1);
  });

  it('treats an explicitly stated default page size as the same read as an implicit one', async () => {
    await GET(request());
    await GET(request('?perPage=24&page=1'));

    expect(getCatalogProducts).toHaveBeenCalledTimes(1);
  });

  it('never lets one shelf answer for another', async () => {
    await GET(request('?category=live-stock'));
    await GET(request('?category=licks-blocks'));

    expect(getCatalogProducts).toHaveBeenCalledTimes(2);
    expect(getCatalogProducts.mock.calls[0][0]).toMatchObject({ categorySlug: 'live-stock' });
    expect(getCatalogProducts.mock.calls[1][0]).toMatchObject({ categorySlug: 'licks-blocks' });
  });

  it('answers a search but never stores one', async () => {
    await GET(request('?search=pink'));
    await GET(request('?search=pink'));

    // Free text drives the key space, so this read must reach the origin every time.
    expect(getCatalogProducts).toHaveBeenCalledTimes(2);
  });

  it('does not store a degraded read, so the next request can recover', async () => {
    getCatalogProducts.mockResolvedValue(listResult({ degraded: true, warnings: ['WooCommerce REST v3 failed'] }));

    const first = await GET(request('?category=edible-pink-salt'));
    const second = await GET(request('?category=edible-pink-salt'));

    expect(getCatalogProducts).toHaveBeenCalledTimes(2);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(second.headers.get('cache-control')).toBe('no-store');
  });

  it('does not store a failed lookup', async () => {
    lookupCatalogProduct.mockResolvedValue({ product: null, related: [], provenance: null, error: 'WooCommerce is unreachable' });

    const first = await GET(request('?slug=some-product'));
    const second = await GET(request('?slug=some-product'));

    expect(lookupCatalogProduct).toHaveBeenCalledTimes(2);
    expect(first.headers.get('cache-control')).toBe('no-store');
  });

  it('stores nothing publicly cacheable, because a shared cache must not hold this response', async () => {
    const response = await GET(request());

    const cacheControl = response.headers.get('cache-control') ?? '';
    expect(cacheControl).not.toContain('public');
    expect(cacheControl).not.toContain('s-maxage');
  });
});
