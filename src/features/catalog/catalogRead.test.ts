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

/**
 * The console's own product fields, on the way back in.
 *
 * The editor writes about thirty fields WooCommerce has no column for. Reading
 * them back is what makes a save visible: with a fabricated default on the read
 * side, a field that was stored and a field that was dropped looked identical on
 * screen — the shape the owner reported as "nothing saves".
 */
describe('the editor\u2019s view of the console\u2019s own fields', () => {
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

  it('shows what the store holds instead of the console default', async () => {
    stubProduct({
      id: 2497,
      name: 'Himalayan Rock Salt — 45 lbs',
      slug: 'himalayan-rock-salt-45-lbs',
      status: 'publish',
      consoleFields: {
        supplierSource: 'Zeedrop',
        supplierProductRef: 'ZD-45-BAG',
        supplierUrl: 'https://supplier.example/item/1',
        promoted: true,
        saleEnabled: false,
        shippingCost: 8.5,
        freeShipping: false,
        deliveryMinDays: 3,
        deliveryMaxDays: 7,
        shippingNote: 'Ships in a wooden crate',
        brand: 'Himalayan Koh',
        features: ['Fine grain', 'Food grade'],
        specifications: { weightOz: 720, packagePreset: 'BOX_BAG_45' },
        listingEndsAt: '2026-10-31T00:00:00.000Z',
        discountType: 'percent',
        discountValue: 10,
        sortOrder: 3,
        ownerNotes: 'Repack in 45 lb bags',
        evidenceNotes: 'Supplier page photographed 2026-09-01',
        riskFlags: ['price_unverified'],
      },
    });

    const p = await getProduct('2497', true);

    expect(p?.supplierSource).toBe('Zeedrop');
    expect(p?.supplierProductRef).toBe('ZD-45-BAG');
    expect(p?.supplierUrl).toBe('https://supplier.example/item/1');
    expect(p?.promoted).toBe(true);
    // The stored `no` wins over the compare-at-derived guess: the owner turned
    // the sale off on purpose.
    expect(p?.saleEnabled).toBe(false);
    expect(p?.shippingCost).toBe(8.5);
    expect(p?.freeShipping).toBe(false);
    expect(p?.deliveryMinDays).toBe(3);
    expect(p?.deliveryMaxDays).toBe(7);
    expect(p?.shippingNote).toBe('Ships in a wooden crate');
    expect(p?.features).toEqual(['Fine grain', 'Food grade']);
    expect(p?.listingEndsAt).toBe('2026-10-31T00:00:00.000Z');
    expect(p?.discountType).toBe('percent');
    expect(p?.discountValue).toBe(10);
    expect(p?.sortOrder).toBe(3);
    expect(p?.ownerNotes).toBe('Repack in 45 lb bags');
    expect(p?.evidenceNotes).toBe('Supplier page photographed 2026-09-01');
    expect(p?.riskFlags).toEqual(['price_unverified']);
    // The store's own weight column still wins for the weight; the stored object
    // is what carries the rest of the Shipping tab's memory.
    expect(p?.specifications.packagePreset).toBe('BOX_BAG_45');
    expect(p?.specifications.weightOz).toBe(720);
  });

  it('keeps the console default when the store holds no value for a field', async () => {
    stubProduct({ id: 2479, name: 'Jar', slug: 'jar', status: 'publish', images: ['https://example.com/a.jpg'] });

    const p = await getProduct('2479', true);

    expect(p?.supplierSource).toBe('WooCommerce');
    expect(p?.freeShipping).toBe(true);
    expect(p?.promoted).toBe(false);
    expect(p?.features).toEqual([]);
    expect(p?.listingEndsAt).toBeNull();
  });
});
