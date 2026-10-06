import { describe, expect, it } from 'vitest';

import type { Product } from '../../data/products';
import {
  DENIED_PRODUCT_FIELDS,
  PUBLIC_PRODUCT_FIELDS,
  toPublicProduct,
  toPublicProducts,
} from './publicProduct';

/**
 * A product carrying everything the source can report, private fields included.
 *
 * Written out in full rather than built by a spread of a smaller fixture, because
 * the point of these tests is that a *populated* private field still cannot leave
 * the server: a fixture that omits `costPrice` would pass whether or not the
 * allowlist works.
 */
const FULL_PRODUCT: Product = {
  id: 2752,
  slug: 'himalayan-salt-rock-for-cattle-30-lbs',
  name: 'Himalayan Koh 30 Lbs Red Rock Salt Lick for Cattle',
  price: '$49.95',
  priceRange: false,
  priceMin: 49.95,
  priceMax: 59.95,
  isFeatured: true,
  image: '/images/products/himalayan-salt-block-30lbs-hero.webp',
  images: ['/images/products/himalayan-salt-block-30lbs-hero.webp'],
  imageResponsive: {
    'https://himalayankoh.com/staging/wp-content/uploads/2026/10/rock.webp': {
      width: 1600,
      tokens: ['300x300', '500x500'],
    },
  },
  category: 'Livestock Salt',
  description: 'Dense red rock salt for cattle.',
  grainSizes: ['Coarse', 'Fine'],
  variations: {
    attributeLabel: 'Grain Size',
    options: [
      {
        id: 2753,
        attribute: 'Grain Size',
        label: 'Coarse',
        value: 'coarse',
        price: 49.95,
        sku: 'HK-LB-30L-COARSE',
        inStock: true,
        image: '/images/products/himalayan-salt-block-30lbs-cow.webp',
      },
    ],
  },
  inStock: true,
  metaTitle: 'Himalayan Salt Lick for Cattle 30 lbs',
  metaDescription: 'A 30 lb red rock salt lick for cattle, mined in the Himalayas.',
  sku: 'HK-LB-30L',
  stockStatus: 'in_stock',
  stockQuantity: 12,
  updatedAt: '2026-10-04T10:17:12.000Z',
  // Everything below is internal and must not survive.
  missing: [],
  commerceReadiness: 'COMMERCE_READY',
  supplierSource: 'Own Stock',
  costPrice: 22.48,
  usInventory: false,
  riskFlags: ['INGESTIBLE'],
  safetyReviewStatus: 'APPROVED_FOR_SALE',
  ownerApproved: true,
};

describe('toPublicProduct', () => {
  it('removes every internal field, even when the source populated it', () => {
    const published = toPublicProduct(FULL_PRODUCT);

    for (const field of DENIED_PRODUCT_FIELDS) {
      // Both checks matter: the key must be gone, not merely undefined, so no
      // `'field' in product` test downstream can still see it.
      expect(field in published).toBe(false);
      expect(published[field]).toBeUndefined();
    }

    // The two an owner would least like published, spelled out.
    expect('costPrice' in published).toBe(false);
    expect('supplierSource' in published).toBe(false);
    expect('safetyReviewStatus' in published).toBe(false);
  });

  it('keeps every public field with the value it came in with', () => {
    const published = toPublicProduct(FULL_PRODUCT);

    for (const field of PUBLIC_PRODUCT_FIELDS) {
      expect(published[field]).toEqual(FULL_PRODUCT[field]);
    }

    expect(published.priceMin).toBe(49.95);
    expect(published.stockQuantity).toBe(12);
    expect(published.images).toEqual(['/images/products/himalayan-salt-block-30lbs-hero.webp']);
  });

  it('keeps the data structures the storefront depends on intact', () => {
    const published = toPublicProduct(FULL_PRODUCT);

    // The cart addresses a variation by attribute and value, and the browser
    // picks an image candidate from this map, so neither may be flattened.
    expect(published.variations).toEqual(FULL_PRODUCT.variations);
    expect(published.imageResponsive).toEqual(FULL_PRODUCT.imageResponsive);
    expect(published.grainSizes).toEqual(['Coarse', 'Fine']);
  });

  it('does not invent a key the product never had', () => {
    const minimal: Product = {
      id: 1,
      slug: 'plain',
      name: 'Plain',
      price: '',
      priceMin: null,
      image: '',
      category: 'Uncategorized',
      inStock: false,
    };

    const published = toPublicProduct(minimal);

    expect('priceMax' in published).toBe(false);
    expect('imageResponsive' in published).toBe(false);
    expect('updatedAt' in published).toBe(false);
    expect('missing' in published).toBe(false);
    expect(Object.keys(published).sort()).toEqual(
      ['category', 'id', 'image', 'inStock', 'name', 'price', 'priceMin', 'slug'].sort()
    );
  });
});

describe('toPublicProducts', () => {
  it('reduces a list, holding the order it arrived in', () => {
    const second: Product = { ...FULL_PRODUCT, id: 2753, slug: 'second' };
    const published = toPublicProducts([FULL_PRODUCT, second]);

    expect(published.map((product) => product.slug)).toEqual([
      'himalayan-salt-rock-for-cattle-30-lbs',
      'second',
    ]);
    expect('costPrice' in published[0]).toBe(false);
  });

  it('answers an absent list with an empty one', () => {
    // A lookup with no related products, or a failed read, reaches the seam as
    // undefined rather than as an empty array.
    expect(toPublicProducts(undefined)).toEqual([]);
    expect(toPublicProducts(null)).toEqual([]);
    expect(toPublicProducts([])).toEqual([]);
  });
});
