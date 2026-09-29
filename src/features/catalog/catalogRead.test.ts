import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CatalogLoadError,
  getProduct,
  parseAdminCatalogRows,
  parsePublicCatalogRows,
} from './repository';

describe('catalog read error boundary', () => {
  it('accepts an explicitly empty admin catalog as a real zero-product result', () => {
    expect(parseAdminCatalogRows({ page: { rows: [] } })).toEqual([]);
  });

  it('accepts public catalog rows without converting them to a false empty result', () => {
    const row = { id: 'p-1', name: 'Salt Block' };
    expect(parsePublicCatalogRows({ products: [row] })).toEqual([row]);
  });

  it('rejects malformed responses instead of treating them as an empty catalog', () => {
    expect(parseAdminCatalogRows({ page: {} })).toBeNull();
    expect(parsePublicCatalogRows({ products: 'not-an-array' })).toBeNull();
    expect(new CatalogLoadError().message).toBe('The product catalog could not be loaded.');
  });
});

describe('the editor\u2019s view of one product\u2019s imagery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubProduct(product: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ product }),
      } as unknown as Response),
    );
  }

  it('shows an image-less product as image-less rather than inventing a placeholder image', async () => {
    stubProduct({
      id: 2484,
      name: 'Himalayan Salt Block — 30 lbs',
      slug: 'himalayan-salt-block-30-lbs',
      status: 'publish',
      images: [],
      storefrontDefaultImages: ['/images/products/himalayan-salt-block-30lbs-hero.webp'],
    });

    const p = await getProduct('2484', true);

    // A placeholder used to be injected here, which made this product read as
    // having one image — the single card the editor drew for a product whose
    // storefront page shows four photographs.
    expect(p?.images).toEqual([]);
    expect(p?.storefrontDefaultImages).toEqual(['/images/products/himalayan-salt-block-30lbs-hero.webp']);
  });

  it('carries the storefront-only images alongside the real gallery', async () => {
    stubProduct({
      id: 2487,
      name: 'Himalayan Salt Lick — 5 to 6 lbs',
      slug: 'himalayan-salt-lick-5-to-6-lbs',
      status: 'publish',
      images: ['https://himalayankoh.com/staging/wp-content/uploads/2022/04/lick-4.jpg'],
      storefrontDefaultImages: [
        '/images/products/himalayan-salt-lick-rope-hero.webp',
        '/images/products/himalayan-salt-lick-rope-front.webp',
      ],
    });

    const p = await getProduct('2487', true);

    expect(p?.images.map((i) => i.url)).toEqual([
      'https://himalayankoh.com/staging/wp-content/uploads/2022/04/lick-4.jpg',
    ]);
    expect(p?.images[0].isPrimary).toBe(true);
    expect(p?.storefrontDefaultImages).toHaveLength(2);
  });

  it('reports no storefront-only images when the read did not carry any', async () => {
    stubProduct({ id: 2479, name: 'Jar', slug: 'jar', status: 'publish', images: ['https://example.com/a.jpg'] });

    const p = await getProduct('2479', true);

    expect(p?.storefrontDefaultImages).toEqual([]);
  });
});
