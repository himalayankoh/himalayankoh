import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The purge is the only thing standing between "the owner saved a price" and "a
 * shopper is still being shown the old one", so its reach is pinned here: the
 * pages the framework caches, and the catalogue read the Worker holds for itself.
 *
 * The read cache matters because `/api/catalog` cannot be edge-cached at all (it
 * reads its own query string), so `revalidatePath('/api/catalog')` clears nothing
 * and the stored read would otherwise outlive the page it disagrees with.
 */

const revalidatePath = vi.fn();
const purgePublicReadCache = vi.fn(async () => {});

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock('./publicReadCache', () => ({
  purgePublicReadCache: () => purgePublicReadCache(),
}));

const { purgePublicBlog, purgePublicCatalog, purgePublicProduct } = await import('./publicCache');

beforeEach(() => {
  revalidatePath.mockReset();
  revalidatePath.mockReturnValue(undefined);
  purgePublicReadCache.mockClear();
});

describe('purgePublicCatalog', () => {
  it('purges the listing, the sitemap and the catalogue endpoint', () => {
    const purged = purgePublicCatalog('a product was saved');

    expect(purged).toEqual(['/products', '/sitemap', '/api/catalog']);
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual(['/products', '/sitemap', '/api/catalog']);
  });

  it('also drops the stored public read behind the endpoint', () => {
    purgePublicCatalog('a product was saved');

    expect(purgePublicReadCache).toHaveBeenCalledTimes(1);
  });

  it('reports only the paths the framework accepted, without throwing', () => {
    // A purge runs after a write that already succeeded; a refusal must cost the
    // purge, never the save.
    revalidatePath.mockImplementation((path: string) => {
      if (path === '/sitemap') throw new Error('no request scope');
    });

    const purged = purgePublicCatalog('a product was saved');

    expect(purged).toEqual(['/products', '/api/catalog']);
  });
});

describe('purgePublicProduct', () => {
  it('purges the product page as well as the catalogue it appears on', () => {
    const purged = purgePublicProduct('some-slug', 'a price changed');

    expect(purged).toEqual(['/products', '/sitemap', '/api/catalog', '/products/some-slug']);
    expect(purgePublicReadCache).toHaveBeenCalledTimes(1);
  });

  it('still purges the catalogue for a product whose slug is unknown', () => {
    const purged = purgePublicProduct(null, 'a delete returned no slug');

    expect(purged).toEqual(['/products', '/sitemap', '/api/catalog']);
    expect(purgePublicReadCache).toHaveBeenCalledTimes(1);
  });
});

describe('purgePublicBlog', () => {
  it('leaves the catalogue read alone, because an article is not a product', () => {
    const purged = purgePublicBlog('an-article', 'it was published');

    expect(purged).toEqual(['/blog', '/blog/an-article']);
    expect(purgePublicReadCache).not.toHaveBeenCalled();
  });
});
