import { describe, expect, it } from 'vitest';

import type { Product } from '../../data/products';
import {
  PRICE_UNAVAILABLE_LABEL,
  collectMissingCatalogFields,
  formatPriceDisplay,
  isPriceKnown,
  priceDisplayFromRange,
} from './price';
import { buildProductPageSeo } from './productSeo';
import { buildProductStructuredData } from './productSchema';
import { hasProhibitedClaim } from './claims';
import {
  isNicheProduct,
  isOwnerApprovedSku,
  isOwnerRejectedProduct,
} from '../catalog/niche';

/** A product whose price the source could not report. */
const unknownPriceProduct: Product = {
  id: 'test-1',
  slug: 'test-honesty-product',
  name: 'Salt Block',
  price: '',
  priceMin: null,
  image: '',
  category: 'Edible Cooking Salt',
  inStock: false,
  sku: null,
  stockStatus: 'unknown',
  missing: ['price', 'sku', 'stockStatus', 'images'],
};

const knownPriceProduct: Product = {
  ...unknownPriceProduct,
  price: '$49.95',
  priceMin: 49.95,
  inStock: true,
  sku: 'HK-LB-30LBS',
  stockStatus: 'in_stock',
  missing: [],
};

describe('priceDisplayFromRange', () => {
  it('returns an empty string — not $0.00 — when the price is unknown', () => {
    expect(priceDisplayFromRange(null)).toBe('');
    expect(priceDisplayFromRange(null, 17.95)).toBe('');
  });

  it('formats a single price and a variant range', () => {
    expect(priceDisplayFromRange(49.95)).toBe('$49.95');
    expect(priceDisplayFromRange(9.95, 17.95)).toBe('$9.95 - $17.95');
  });

  it('treats a zero top-of-range as no range, matching the legacy mapper', () => {
    expect(priceDisplayFromRange(9.95, 0)).toBe('$9.95');
  });
});

describe('isPriceKnown / formatPriceDisplay', () => {
  it('treats a null price as unknown', () => {
    expect(isPriceKnown(unknownPriceProduct)).toBe(false);
    expect(formatPriceDisplay(unknownPriceProduct)).toBe(PRICE_UNAVAILABLE_LABEL);
  });

  it('passes a real price through unchanged', () => {
    expect(isPriceKnown(knownPriceProduct)).toBe(true);
    expect(formatPriceDisplay(knownPriceProduct)).toBe('$49.95');
  });
});

describe('collectMissingCatalogFields', () => {
  it('names every field the source failed to supply', () => {
    expect(
      collectMissingCatalogFields({ priceMin: null, sku: null, stockStatus: 'unknown', images: [] })
    ).toEqual(['price', 'sku', 'stockStatus', 'images']);
  });

  it('is empty for a complete product', () => {
    expect(
      collectMissingCatalogFields({ priceMin: 1, sku: 'X', stockStatus: 'in_stock', images: ['a'] })
    ).toEqual([]);
  });
});

// A dollar amount with cents. Deliberately narrower than /\$\d/, which would
// also match the template's "orders over $50" shipping threshold.
const MONEY = /\$\d+\.\d{2}/;

describe('meta description honesty', () => {
  it('omits the price sentence entirely when no price was reported', () => {
    const { description } = buildProductPageSeo(unknownPriceProduct);

    expect(description).toBe(
      'Salt Block — a Himalayan pink salt block for grilling and serving. Unrefined, additive-free salt from Himalayan Koh.'
    );
    expect(description).not.toMatch(MONEY);
    expect(description).not.toMatch(/nan|NaN|null|undefined/);
  });

  it('keeps the known-price description byte-identical to the legacy output', () => {
    const { description } = buildProductPageSeo(knownPriceProduct);

    // The price clause is unchanged; only the shelf sentence moved, because the
    // description now follows the shelf the product is actually listed under.
    expect(description).toBe(
      'Salt Block — a Himalayan pink salt block for grilling and serving. $49.95. Unrefined, additive-free salt from Himalayan Koh.'
    );
    expect(description).not.toMatch(/nan|NaN|null|undefined/);
  });

  it('describes an edible product as edible, not as a block', () => {
    // Placement comes from the shelf taxonomy, so the meta sentence and the hub
    // the product appears on cannot disagree about what kind of salt this is.
    const jar: Product = {
      ...knownPriceProduct,
      name: 'Himalayan Pink Salt Jar 1 lb',
      category: 'Edible Cooking Salt',
    };

    expect(buildProductPageSeo(jar).description).toContain(
      'unrefined Himalayan pink salt with its natural trace minerals'
    );
  });

  it('makes no claim the salt cannot support, for any product', () => {
    const { description } = buildProductPageSeo({ ...knownPriceProduct, name: 'Salt Block 30 lbs' });

    // The rule this replaced banned the words livestock/horse/cattle/deer, which
    // refused the owner's own salt licks and salt blocks while still letting a
    // fabricated certification through. Claims are what has to be refused; the
    // subject matter is legitimate (see claims.test.ts).
    expect(hasProhibitedClaim(description)).toBe(false);
  });
});

/**
 * Owner-approved Salt Lick and Salt Block products are the reason this store
 * exists, and a previous rule refused them for naming their animals. These are
 * the regression tests for that: the approved copy has to pass every generated
 * surface, and the catalog guard has to keep the product.
 */
describe('owner-approved Salt Lick products', () => {
  const approvedLicks = [
    { sku: 'HK-LFH-2lbs', name: 'Himalayan Salt Lick — 1 to 2 lbs', price: '$12.95', priceMin: 12.95 },
    { sku: 'HK-LFH-4lbs', name: 'Himalayan Salt Lick — 3 to 4 lbs', price: '$14.95', priceMin: 14.95 },
    { sku: 'HK-LFH-14lbs', name: 'Himalayan Salt Lick — 12 to 14 lbs', price: '$29.95', priceMin: 29.95 },
    { sku: 'HK-LFH-30lbs', name: 'Himalayan Salt Lick — 30 lbs', price: '$39.95', priceMin: 39.95 },
    { sku: 'HK-LB-30LBS', name: 'Himalayan Salt Block — 30 lbs', price: '$49.95', priceMin: 49.95 },
    { sku: 'HK-BFD-8-4-1', name: 'Himalayan Salt Block — Rectangular 8 x 4 x 1 in', price: '$14.95', priceMin: 14.95 },
  ];

  it.each(approvedLicks)('keeps the catalog entry for $sku', ({ sku, name }) => {
    expect(isOwnerApprovedSku(sku)).toBe(true);
    expect(isNicheProduct({ id: 9999, name, sku, category: 'Salt Licks' })).toBe(true);
  });

  it.each(approvedLicks)('publishes honest SEO copy for $sku', ({ sku, name, price, priceMin }) => {
    const product: Product = {
      ...knownPriceProduct,
      id: sku,
      slug: 'himalayan-salt-lick',
      name,
      sku,
      price,
      priceMin,
      category: 'Salt Licks',
    };

    const { title, description } = buildProductPageSeo(product);

    // Nothing is invented and nothing is refused for naming the animal it is for.
    // The title is compared as a prefix because the SEO title budget truncates a
    // long product name — that is length control, not a lost product.
    expect(title.startsWith(name.slice(0, 24))).toBe(true);
    expect(title).toContain('Himalayan Koh');
    expect(description).toContain(price);
    expect(hasProhibitedClaim(description)).toBe(false);

    const graph = buildProductStructuredData(product)['@graph'] as Record<string, unknown>[];
    const node = graph.find((entry) => entry['@type'] === 'Product')!;
    expect(node.sku).toBe(sku);
    expect((node.offers as Record<string, unknown>).price).toBe(priceMin);
  });

  it('still refuses the records the owner rejected, whatever they are called', () => {
    // The three records the owner explicitly does not want on the new storefront.
    expect(isOwnerRejectedProduct(2185)).toBe(true);
    expect(isOwnerRejectedProduct(2192)).toBe(true);
    expect(isOwnerRejectedProduct(2295)).toBe(true);
    expect(isOwnerRejectedProduct(2294)).toBe(true);

    // Animal-feed records name their animal and are not owner-approved SKUs, so a
    // record the owner has not named is refused however it is priced or filed.
    expect(isOwnerApprovedSku('5483976372749')).toBe(false);
    expect(
      isNicheProduct({ id: null, name: 'Himalayan Pink Salt Licks for Horses', sku: null, category: 'animal feed' })
    ).toBe(false);
    expect(
      isNicheProduct({ id: 286, name: 'Himalayan Pink Salt Block for Deer', sku: null, category: 'animal feed' })
    ).toBe(false);

    // The owner's live-launch admission is what admits the two live livestock
    // records, and it is the record that is admitted — not the wording. The same
    // name and category with no admitted id is still refused, which is asserted
    // above; this is the same product *with* its id.
    expect(
      isNicheProduct({ id: 281, name: 'Himalayan Pink Salt Licks for Horses', sku: null, category: 'animal feed' })
    ).toBe(true);
  });
});

describe('Product structured data honesty', () => {
  it('omits the Offer node rather than publishing a price it does not have', () => {
    const graph = buildProductStructuredData(unknownPriceProduct)['@graph'] as Record<string, unknown>[];
    const productNode = graph.find((node) => node['@type'] === 'Product')!;

    expect(productNode).toBeDefined();
    expect(productNode.offers).toBeUndefined();
  });

  it('never publishes the internal id as a SKU', () => {
    const withNullSku = buildProductStructuredData(unknownPriceProduct)['@graph'] as Record<string, unknown>[];
    const node = withNullSku.find((entry) => entry['@type'] === 'Product')!;
    expect(node.sku).toBeUndefined();

    const withSku = buildProductStructuredData(knownPriceProduct)['@graph'] as Record<string, unknown>[];
    const nodeWithSku = withSku.find((entry) => entry['@type'] === 'Product')!;
    expect(nodeWithSku.sku).toBe('HK-LB-30LBS');
  });

  it('still publishes a complete Offer for a product with a real price', () => {
    const graph = buildProductStructuredData(knownPriceProduct)['@graph'] as Record<string, unknown>[];
    const offers = graph.find((node) => node['@type'] === 'Product')!.offers as Record<string, unknown>;

    expect(offers.price).toBe(49.95);
    expect(offers.priceCurrency).toBe('USD');
    expect(offers.availability).toBe('https://schema.org/InStock');
  });
});
