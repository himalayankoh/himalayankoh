import { describe, expect, it } from 'vitest';
import {
  MAX_VARIANT_COMBINATIONS,
  STORE_ORIGIN,
  inspectImportUrl,
  inspectWatchUrl,
  isCampaignReady,
  isMatrixOverflow,
  listingDefects,
  shelfComposition,
  shelfDepth,
  slugify,
  taggedCampaignUrl,
  unavailableFields,
  usableAxes,
  variantCombinations,
} from './tools';
import type { AdminCatalogRow } from '../backend';

/* ------------------------------------------------------------------ */

describe('slugify', () => {
  it('normalises a display tag to one campaign name', () => {
    expect(slugify('Winter Restock')).toBe('winter-restock');
    expect(slugify('  winter-restock ')).toBe('winter-restock');
    expect(slugify('Winter   RESTOCK')).toBe('winter-restock');
  });

  it('strips leading and trailing separators rather than leaving them', () => {
    expect(slugify('-Sale-')).toBe('sale');
    expect(slugify('!!!')).toBe('');
  });
});

describe('taggedCampaignUrl', () => {
  it('builds a tagged production URL from the defaults', () => {
    expect(
      taggedCampaignUrl({ path: '/products', source: 'newsletter', medium: 'email', campaign: 'winter-restock' })
    ).toBe(`${STORE_ORIGIN}/products?utm_source=newsletter&utm_medium=email&utm_campaign=winter-restock`);
  });

  it('normalises the path and omits empty tags instead of emitting a blank one', () => {
    const url = taggedCampaignUrl({ path: 'products', source: 'Newsletter', medium: '', campaign: '' });
    expect(url).toBe(`${STORE_ORIGIN}/products?utm_source=newsletter`);
  });

  it('falls back to the site root when the path is blank', () => {
    expect(taggedCampaignUrl({ path: '', source: 's', medium: 'm', campaign: 'c' })).toBe(
      `${STORE_ORIGIN}/?utm_source=s&utm_medium=m&utm_campaign=c`
    );
  });

  it('never emits a preview host, and tolerates a trailing slash on the origin', () => {
    const url = taggedCampaignUrl({
      path: '/about',
      source: 'google',
      medium: 'cpc',
      campaign: 'brand',
      origin: 'https://himalayankoh.com/',
    });
    expect(url.startsWith('https://himalayankoh.com/about?')).toBe(true);
    expect(url).not.toContain('preview.');
  });
});

/* ------------------------------------------------------------------ */

describe('inspectImportUrl', () => {
  it('accepts an external product page and reports its host', () => {
    const result = inspectImportUrl('https://supplier.example/products/pink-salt-jar');
    expect(result.ok).toBe(true);
    expect(result.host).toBe('supplier.example');
  });

  it('rejects empty, malformed and non-http input', () => {
    expect(inspectImportUrl('').ok).toBe(false);
    expect(inspectImportUrl('   ').ok).toBe(false);
    expect(inspectImportUrl('supplier.example/products').ok).toBe(false);
    expect(inspectImportUrl('ftp://supplier.example/p').ok).toBe(false);
  });

  it('rejects this store, including a subdomain of it', () => {
    expect(inspectImportUrl('https://himalayankoh.com/products/x').ok).toBe(false);
    expect(inspectImportUrl('https://www.himalayankoh.com/products/x').ok).toBe(false);
    expect(inspectImportUrl('https://preview.himalayankoh.com/products/x').ok).toBe(false);
  });

  it('does not reject a host that merely ends in the store domain as a string', () => {
    expect(inspectImportUrl('https://nothimalayankoh.com/p').ok).toBe(true);
    expect(inspectImportUrl('https://himalayankoh.com.evil.test/p').ok).toBe(true);
  });
});

describe('inspectWatchUrl', () => {
  it('accepts a supplier page and says so', () => {
    const result = inspectWatchUrl('https://supplier.example/collections/salt');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('supplier.example');
  });

  it('rejects this store as a watch target', () => {
    expect(inspectWatchUrl('https://himalayankoh.com/staging/').ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe('variantCombinations', () => {
  it('returns nothing for no usable axis, not a single empty row', () => {
    expect(variantCombinations([])).toEqual([]);
    expect(variantCombinations([{ name: 'Weight', values: '   ' }])).toEqual([]);
    expect(variantCombinations([{ name: '', values: '1 lb' }])).toEqual([]);
  });

  it('builds one row per value for a single axis', () => {
    expect(variantCombinations([{ name: 'Weight', values: '1 lb, 2 lb, 5 lb' }])).toEqual([
      ['Weight: 1 lb'],
      ['Weight: 2 lb'],
      ['Weight: 5 lb'],
    ]);
  });

  it('is the cartesian product across axes', () => {
    const rows = variantCombinations([
      { name: 'Weight', values: '1 lb, 5 lb' },
      { name: 'Pack', values: 'single, case' },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual(['Weight: 1 lb', 'Pack: single']);
    expect(rows).toContainEqual(['Weight: 5 lb', 'Pack: case']);
  });

  it('ignores a blank value inside a list rather than making an empty variant', () => {
    expect(variantCombinations([{ name: 'Size', values: 'small, , large' }])).toHaveLength(2);
  });

  it('flags a matrix above the ceiling and not one exactly at it', () => {
    expect(isMatrixOverflow(MAX_VARIANT_COMBINATIONS)).toBe(false);
    expect(isMatrixOverflow(MAX_VARIANT_COMBINATIONS + 1)).toBe(true);
  });

  it('counts usable axes only', () => {
    expect(usableAxes([{ name: 'W', values: '1' }, { name: '', values: 'x' }])).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */

function row(overrides: Partial<AdminCatalogRow> = {}): AdminCatalogRow {
  return {
    source: 'woocommerce',
    id: '1',
    name: 'Himalayan Pink Salt 5 lb Pouch',
    slug: 'pink-salt-5lb',
    image: '/images/salt.png',
    images: [],
    storefrontDefaultImages: [],
    consoleFields: {},
    categoryName: 'Bulk Order',
    categoryId: 'bulk-order',
    price: '$19.95',
    priceMin: 19.95,
    priceMax: null,
    compareAtPrice: null,
    sku: 'HK-LICK-5',
    stockStatus: 'in_stock',
    stockQuantity: null,
    lowStockThreshold: null,
    trackInventory: null,
    weight: null,
    weightUnit: null,
    isListed: true,
    status: 'publish',
    isHiddenFromStorefront: null,
    isFeatured: false,
    isOffNiche: false,
    missing: [],
    ...overrides,
  };
}

describe('listingDefects', () => {
  it('finds nothing wrong with a fully reported product', () => {
    expect(listingDefects(row())).toEqual([]);
  });

  it('does not treat a field the source cannot report as a defect', () => {
    const storeApiRow = row({ price: '', sku: null, stockStatus: 'unknown', missing: ['price', 'sku', 'stock'] });
    expect(listingDefects(storeApiRow)).toEqual([]);
  });

  it('does treat an absent field the source *can* report as a defect', () => {
    expect(listingDefects(row({ sku: null }))).toContain('No SKU set');
    expect(listingDefects(row({ price: '' }))).toContain('No price set');
  });

  it('reports images and listing state', () => {
    expect(listingDefects(row({ image: '' }))).toContain('No image');
    expect(listingDefects(row({ isListed: false }))).toContain('Listing is inactive');
    expect(listingDefects(row({ isHiddenFromStorefront: true }))).toContain('Hidden from the storefront');
  });

  it('names unreadable fields separately from defects', () => {
    const storeApiRow = row({ price: '', sku: null, stockStatus: 'unknown', missing: ['price', 'sku'] });
    expect(unavailableFields(storeApiRow)).toEqual(['price', 'SKU', 'stock']);
    expect(listingDefects(storeApiRow)).toEqual([]);
  });
});

describe('isCampaignReady', () => {
  it('requires a price that was actually readable', () => {
    expect(isCampaignReady(row())).toBe(true);
    expect(isCampaignReady(row({ price: '  ' }))).toBe(false);
    expect(isCampaignReady(row({ price: '', missing: ['price'] }))).toBe(false);
  });
});

describe('shelfComposition', () => {
  it('counts per category, thinnest first, and uses a real label for an absent one', () => {
    const entries = shelfComposition([
      row({ id: '1', categoryName: 'Bulk Order' }),
      row({ id: '2', categoryName: 'Bulk Order', price: '', missing: ['price'], stockStatus: 'unknown' }),
      row({ id: '3', categoryName: 'Salt Lamps & Décor' }),
      row({ id: '4', categoryName: null }),
      row({ id: '5', categoryName: 'Salt Lamps & Décor' }),
    ]);

    // Thinnest first: one uncategorised product, then the two two-product
    // shelves ordered by name.
    expect(entries.map((entry) => entry.name)).toEqual([
      'Uncategorised',
      'Bulk Order',
      'Salt Lamps & Décor',
    ]);
    const bulk = entries[1];
    expect(bulk.total).toBe(2);
    expect(bulk.priced).toBe(1);
    expect(bulk.stockKnown).toBe(1);
  });

  it('is empty for an empty catalog', () => {
    expect(shelfComposition([])).toEqual([]);
  });
});

describe('shelfDepth', () => {
  it('separates a thin shelf from a deep one', () => {
    expect(shelfDepth(1)).toBe('thin');
    expect(shelfDepth(2)).toBe('thin');
    expect(shelfDepth(3)).toBe('narrow');
    expect(shelfDepth(5)).toBe('narrow');
    expect(shelfDepth(6)).toBe('deep');
  });
});
