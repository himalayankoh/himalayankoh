import { describe, expect, it } from 'vitest';

import type { Product as CatalogProduct } from '../../data/products';
import { fromWooProduct } from '../woo/productPayload';
import {
  applyStoreRecord,
  rowFromCatalogProduct,
  rowFromWooAdminProduct,
  sortAdminCatalogRows,
  statsFromRows,
  type AdminCatalogRow,
} from './adminCatalog';

/** A row straight off the WooCommerce read, before any projection. */
function catalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 2461,
    slug: 'himalayan-koh-edible-salt-grain',
    name: 'Edible Pink Salt',
    price: '',
    priceMin: null,
    image: 'https://himalayankoh.com/staging/wp-content/uploads/salt.jpg',
    images: ['https://himalayankoh.com/staging/wp-content/uploads/salt.jpg'],
    category: 'Edible Cooking Salt',
    inStock: false,
    sku: null,
    stockStatus: 'unknown',
    missing: ['price', 'sku', 'stockStatus'],
    ...overrides,
  };
}

describe('rowFromCatalogProduct', () => {
  it('reports what the source could not supply as unknown, never as a value', () => {
    const row = rowFromCatalogProduct(catalogProduct());

    expect(row.price).toBe('');
    expect(row.priceMin).toBeNull();
    expect(row.sku).toBeNull();
    expect(row.stockStatus).toBe('unknown');
    expect(row.stockQuantity).toBeNull();
    expect(row.trackInventory).toBeNull();
    expect(row.missing).toEqual(['price', 'sku', 'stockStatus']);
  });

  it('keeps the real values when the source reported them', () => {
    const row = rowFromCatalogProduct(
      catalogProduct({
        price: '$19.95',
        priceMin: 19.95,
        sku: 'HK-LB-30LBS',
        stockStatus: 'in_stock',
        inStock: true,
        isFeatured: true,
        missing: [],
      })
    );

    expect(row.price).toBe('$19.95');
    expect(row.sku).toBe('HK-LB-30LBS');
    expect(row.stockStatus).toBe('in_stock');
    expect(row.isFeatured).toBe(true);
    expect(row.missing).toEqual([]);
  });

  it('treats priceMax as a variant range, not a discount', () => {
    const row = rowFromCatalogProduct(catalogProduct({ price: '$9.95 - $17.95', priceMin: 9.95, priceMax: 17.95 }));

    expect(row.priceMax).toBe(17.95);
    expect(row.compareAtPrice).toBeNull();
  });

  it('treats the model\'s category placeholder as a category the source never reported', () => {
    const row = rowFromCatalogProduct(catalogProduct({ category: 'Uncategorized' }));

    expect(row.categoryName).toBeNull();
    expect(row.categoryId).toBeNull();
  });

  it('carries no editor record, so the row cannot be written back', () => {
    const row = rowFromCatalogProduct(catalogProduct());

    expect(row.source).toBe('woocommerce');
  });

  it('reports no term ids and no SEO, because the public read carries neither', () => {
    const row = rowFromCatalogProduct(catalogProduct());

    expect(row.categoryIds).toEqual([]);
    expect(row.seoTitle).toBeNull();
    expect(row.seoDescription).toBeNull();
    expect(row.seoKeywords).toEqual([]);
    expect(row.canonicalSlug).toBeNull();
  });
});

/**
 * The bug these pin, measured on staging: every imported product's row showed
 * `SEO: None` and a blank category, while the store held Yoast meta and real
 * term ids. The console read published products through the storefront's public
 * read, which reports neither, and its `categoryId` was the facet *name* — a
 * value no category option (all numeric) could match.
 */
describe('applyStoreRecord', () => {
  it('fills the numeric term ids and SEO the public read cannot report', () => {
    const row = rowFromCatalogProduct(catalogProduct({ id: 2704, category: 'Edible Pink Salt' }));
    expect(row.categoryId).toBe('Edible Pink Salt');

    const record = fromWooProduct({
      id: 2704,
      name: 'Edible Pink Salt',
      slug: 'edible-pink-salt',
      status: 'publish',
      categories: [{ id: 121, name: 'Edible Pink Salt' }],
      meta_data: [
        { key: '_yoast_wpseo_title', value: 'Edible Pink Salt | Himalayan Koh' },
        { key: '_yoast_wpseo_metadesc', value: 'Fine grain edible pink salt.' },
        { key: '_himalayan_koh_seo_keywords', value: '["pink salt","edible"]' },
      ],
    });

    const enriched = applyStoreRecord(row, record);

    expect(enriched.categoryIds).toEqual(['121']);
    expect(enriched.seoTitle).toBe('Edible Pink Salt | Himalayan Koh');
    expect(enriched.seoDescription).toBe('Fine grain edible pink salt.');
    expect(enriched.seoKeywords).toEqual(['pink salt', 'edible']);
    // The facet id keeps the storefront read's value: the console's category
    // *filter* is built from those names and must not change shape here.
    expect(enriched.categoryId).toBe('Edible Pink Salt');
    expect(enriched.categoryName).toBe('Edible Pink Salt');
  });

  it('leaves the row alone when the store record has no term ids of its own', () => {
    const row = rowFromCatalogProduct(catalogProduct({ id: 1, category: 'Salt Licks' }));
    const record = fromWooProduct({ id: 1, name: 'Lick', slug: 'lick', status: 'publish' });

    expect(applyStoreRecord(row, record).categoryIds).toEqual([]);
  });
});

describe('rowFromWooAdminProduct — the data an edit needs', () => {
  it('carries the store term ids and SEO, so a row it reports can be edited', () => {
    const row = rowFromWooAdminProduct(
      fromWooProduct({
        id: 2716,
        name: 'Bag of Himalayan Pink Salt',
        slug: 'bag-of-himalayan-pink-salt',
        status: 'draft',
        categories: [{ id: 75, name: 'Uncategorized' }],
        meta_data: [{ key: '_yoast_wpseo_title', value: 'Bag of Pink Salt' }],
      })
    );

    expect(row.categoryIds).toEqual(['75']);
    expect(row.seoTitle).toBe('Bag of Pink Salt');
    expect(row.seoDescription).toBeNull();
    expect(row.seoKeywords).toEqual([]);
  });
});

describe('sortAdminCatalogRows', () => {
  const priced = (id: string, priceMin: number | null): AdminCatalogRow =>
    rowFromCatalogProduct(catalogProduct({ id, slug: `p-${id}`, priceMin, price: priceMin === null ? '' : `$${priceMin}` }));

  it('orders unknown prices last in both directions', () => {
    const rows = [priced('unknown', null), priced('cheap', 5), priced('dear', 50)];

    expect(sortAdminCatalogRows(rows, 'price_asc').map((row) => row.id)).toEqual(['cheap', 'dear', 'unknown']);
    expect(sortAdminCatalogRows(rows, 'price_desc').map((row) => row.id)).toEqual(['dear', 'cheap', 'unknown']);
  });
});

describe('statsFromRows', () => {
  it('counts the fields the WooCommerce source could not report', () => {
    const rows = [
      rowFromCatalogProduct(catalogProduct({ missing: ['price', 'sku', 'stockStatus'] })),
      rowFromCatalogProduct(
        catalogProduct({ id: 2, slug: 'p-2', sku: 'HK-2', stockStatus: 'in_stock', missing: ['price'] })
      ),
    ];

    const stats = statsFromRows(rows);
    expect(stats.source).toBe('woocommerce');

    expect(stats.total).toBe(2);
    expect(stats.priceUnavailable).toBe(2);
    expect(stats.skuUnavailable).toBe(1);
    expect(stats.stockUnknown).toBe(1);
    expect(stats.featured).toBe(0);
  });

  it('counts categories, not products', () => {
    const rows = [
      rowFromCatalogProduct(catalogProduct({ id: 1, slug: 'a', category: 'Salt Lamps' })),
      rowFromCatalogProduct(catalogProduct({ id: 2, slug: 'b', category: 'Salt Lamps' })),
      rowFromCatalogProduct(catalogProduct({ id: 3, slug: 'c', category: 'Edible Cooking Salt' })),
      rowFromCatalogProduct(catalogProduct({ id: 4, slug: 'd', category: '' })),
      rowFromCatalogProduct(catalogProduct({ id: 5, slug: 'e', category: 'Uncategorized' })),
    ];

    expect(statsFromRows(rows).categories).toBe(2);
    expect(statsFromRows(rows).total).toBe(5);
  });
});

/**
 * The bug these pin, measured on staging: product 2484's page showed four
 * photographs while its editor showed none. The single-product route had been
 * taught about the app-shipped defaults, but the console opens the editor
 * through the products list, whose rows had not — so the editor was handed a
 * product whose extra images had been quietly dropped in transit, and the
 * panel that was supposed to explain the gap never rendered.
 */
describe('rowFromWooAdminProduct', () => {
  it('carries the storefront-only imagery, so the list read cannot lose it', () => {
    const row = rowFromWooAdminProduct(
      fromWooProduct({
        id: 2484,
        name: 'Himalayan Salt Block — 30 lbs',
        slug: 'himalayan-salt-block-30-lbs',
        sku: 'HK-LB-30LBS',
        status: 'publish',
        images: [],
      })
    );

    expect(row.images).toEqual([]);
    expect(row.storefrontDefaultImages).toHaveLength(4);
    expect(row.storefrontDefaultImages[0]).toBe(
      '/images/products/himalayan-salt-block-30lbs-hero.webp'
    );
  });

  it('reports nothing storefront-only for a product the curated map does not cover', () => {
    const row = rowFromWooAdminProduct(
      fromWooProduct({ id: 2479, slug: 'himalayan-pink-edible-salt-16-oz-jar', images: [] })
    );

    expect(row.storefrontDefaultImages).toEqual([]);
  });

  it('does not claim a storefront-only image when the storefront read already merged it', () => {
    // `rowFromCatalogProduct` reads `data/products`, where the curated set has
    // already been folded into `images`; the row owes the editor no second list.
    const row = rowFromCatalogProduct(
      catalogProduct({ slug: 'himalayan-salt-block-30-lbs', sku: 'HK-LB-30LBS' })
    );

    expect(row.storefrontDefaultImages).toEqual([]);
  });
});
