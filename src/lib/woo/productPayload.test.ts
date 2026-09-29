import { describe, expect, it } from 'vitest';

import {
  fromWooProduct,
  isUnusablePrice,
  priceFields,
  sellingPrice,
  toPriceNumber,
  CONSOLE_META_FIELDS,
  PRODUCT_WRITE_FIELDS,
  toWooProductBody,
  toWooVariationBody,
  unsupportedProductWriteFields,
  unsupportedVariationWriteFields,
  variationPriceFields,
  wooImageSources,
  variationLabel,
  variationPriceRange,
} from './productPayload';

describe('priceFields', () => {
  it('writes a plain price as the regular price and clears any sale', () => {
    expect(priceFields({ price: 9.95 })).toEqual({ regular_price: '9.95', sale_price: '' });
  });

  /**
   * The failure this pins, measured on staging: a product on sale was edited to a
   * new price with no compare-at, and the store kept charging the old sale price —
   * `regular_price` was written, `sale_price` was not cleared, and WooCommerce
   * charges the sale price whenever one is set. The console then read the sale price
   * back, so the owner saw their edit apparently ignored.
   */
  it('does not leave a stale sale price behind a new plain price', () => {
    const written = priceFields({ price: 21 });
    expect(written).toEqual({ regular_price: '21.00', sale_price: '' });
    // The pair WooCommerce would then report as the selling price.
    expect(sellingPrice({ regular_price: '21.00', sale_price: written.sale_price ?? '' })).toEqual({
      price: 21,
      compareAtPrice: null,
    });
  });

  it('turns a compare-at price into a real WooCommerce sale', () => {
    // The customer pays $9.95; $17.95 is the "was" price. Writing them the other
    // way round advertises the discount as the normal price.
    expect(priceFields({ price: 9.95, compareAtPrice: 17.95 })).toEqual({
      regular_price: '17.95',
      sale_price: '9.95',
    });
  });

  it('ends a sale when the compare-at price is removed', () => {
    expect(priceFields({ price: 9.95, compareAtPrice: null })).toEqual({
      regular_price: '9.95',
      sale_price: '',
    });
  });

  it('clears both fields when the price is cleared', () => {
    expect(priceFields({ price: null })).toEqual({ regular_price: '', sale_price: '' });
  });

  it('says nothing when the caller said nothing', () => {
    expect(priceFields({})).toEqual({});
  });

  it('accepts a numeric string, which is what a form field produces', () => {
    // Dropping this used to answer 200 with the store unchanged: `toWooDecimal`
    // is number-only, so a string fell through to `undefined` and JSON omitted
    // the field entirely. A silent no-op on the price is the one outcome the
    // mapper must not produce.
    expect(priceFields({ price: '9.95' })).toEqual({ regular_price: '9.95', sale_price: '' });
    expect(priceFields({ price: '9.95', compareAtPrice: '17.95' })).toEqual({
      regular_price: '17.95',
      sale_price: '9.95',
    });
    expect(priceFields({ price: ' 12 ' })).toEqual({ regular_price: '12.00', sale_price: '' });
  });

  it('treats an empty string as a cleared price, like null', () => {
    expect(priceFields({ price: '' })).toEqual({ regular_price: '', sale_price: '' });
  });

  it('never turns an unreadable price into a write', () => {
    // Refused at the API boundary instead; the mapper must not invent a price.
    expect(isUnusablePrice('abc')).toBe(true);
    expect(isUnusablePrice('')).toBe(false);
    expect(isUnusablePrice(null)).toBe(false);
    expect(isUnusablePrice(undefined)).toBe(false);
    expect(isUnusablePrice(0)).toBe(false);
    expect(isUnusablePrice('2.50')).toBe(false);
  });
});

describe('toPriceNumber', () => {
  it('passes numbers through and leaves absence absent', () => {
    expect(toPriceNumber(9.95)).toBe(9.95);
    expect(toPriceNumber(0)).toBe(0);
    expect(toPriceNumber(undefined)).toBeUndefined();
    expect(toPriceNumber(null)).toBeNull();
  });

  it('reads a numeric string and refuses anything else', () => {
    expect(toPriceNumber('9.95')).toBe(9.95);
    expect(toPriceNumber(' 9.95 ')).toBe(9.95);
    expect(toPriceNumber('')).toBeNull();
    expect(toPriceNumber('free')).toBeUndefined();
    expect(toPriceNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('toWooProductBody', () => {
  it('emits only the keys the caller supplied', () => {
    const body = toWooProductBody({ status: 'draft' });
    expect(body).toEqual({ status: 'draft' });
    expect('description' in body).toBe(false);
  });

  it('sends an empty SKU as an instruction to remove it', () => {
    expect(toWooProductBody({ sku: '' })).toEqual({ sku: '' });
  });

  it('omits the SKU entirely when it was not part of the patch', () => {
    expect('sku' in toWooProductBody({ name: 'Salt' })).toBe(false);
  });

  it('drops image sources WooCommerce cannot hold', () => {
    // The storefront's curated defaults are relative paths in this app, and
    // WooCommerce rejects the whole product write over one bad image — so they
    // are filtered before the request rather than sent and refused.
    expect(wooImageSources([
      '/images/products/himalayan-salt-lick-rope-hero.webp',
      'https://example.com/real.webp',
      'https://example.com/badge-icon.png',
      'https://example.com/logo.svg',
      '  https://example.com/padded.jpg  ',
      '',
      null,
    ])).toEqual(['https://example.com/real.webp', 'https://example.com/padded.jpg']);

    const body = toWooProductBody({
      images: ['/images/products/curated.webp', 'https://example.com/real.webp'],
    });
    expect(body.images).toEqual([{ src: 'https://example.com/real.webp' }]);
  });

  it('maps taxonomy and images to WooCommerce shapes', () => {
    const body = toWooProductBody({
      categoryIds: [75, 76],
      tags: ['pink salt'],
      images: ['https://example.test/a.jpg'],
    });
    expect(body.categories).toEqual([{ id: 75 }, { id: 76 }]);
    expect(body.tags).toEqual([{ name: 'pink salt' }]);
    expect(body.images).toEqual([{ src: 'https://example.test/a.jpg' }]);
  });

  it('maps images from both string URLs and image objects with src/alt/id', () => {
    const body = toWooProductBody({
      images: [
        'https://example.com/image1.jpg',
        { src: 'https://example.com/image2.jpg', alt: 'Test Alt 2' },
        { id: 456, src: 'https://example.com/image3.jpg' },
      ],
    });
    expect(body.images).toEqual([
      { src: 'https://example.com/image1.jpg' },
      { src: 'https://example.com/image2.jpg', alt: 'Test Alt 2' },
      { id: 456, src: 'https://example.com/image3.jpg' },
    ]);
  });

  it('includes pricing, shipping, custom economics, and generated SEO in one payload', () => {
    const body = toWooProductBody({
      price: 99,
      costPrice: 25,
      landedCost: 25,
      weight: 45,
      dimensions: { length: 40, width: 30, height: 20 },
      packagePreset: 'custom',
      canonicalSlug: 'himalayan-rock-salt-45-lbs-2-3-large-chunks',
      seoKeywords: ['himalayan rock salt', 'salt block'],
      seo: { title: 'Himalayan Rock Salt 45 lbs', description: 'A factual product description.' },
    });
    expect(body.regular_price).toBe('99.00');
    expect(body.weight).toBe('45');
    expect(body.dimensions).toEqual({ length: '40', width: '30', height: '20' });
    expect(body.meta_data).toEqual([
      { key: '_himalayan_koh_cost_price', value: '25' },
      { key: '_himalayan_koh_landed_cost', value: '25' },
      { key: '_himalayan_koh_package_preset', value: 'custom' },
      { key: '_himalayan_koh_seo_keywords', value: '["himalayan rock salt","salt block"]' },
      { key: '_himalayan_koh_canonical_slug', value: 'himalayan-rock-salt-45-lbs-2-3-large-chunks' },
      { key: '_yoast_wpseo_title', value: 'Himalayan Rock Salt 45 lbs' },
      { key: '_yoast_wpseo_metadesc', value: 'A factual product description.' },
    ]);
  });
});

describe('sellingPrice', () => {
  it('reads a sale as the price the customer pays', () => {
    expect(sellingPrice({ regular_price: '17.95', sale_price: '9.25' })).toEqual({
      price: 9.25,
      compareAtPrice: 17.95,
    });
  });

  it('reports no compare-at when the product is not on sale', () => {
    expect(sellingPrice({ regular_price: '9.95', sale_price: '' })).toEqual({
      price: 9.95,
      compareAtPrice: null,
    });
  });

  it('returns null rather than zero for an unpriced product', () => {
    expect(sellingPrice({ regular_price: '', sale_price: '' })).toEqual({
      price: null,
      compareAtPrice: null,
    });
  });
});

describe('fromWooProduct', () => {
  it('keeps absence as absence for price, SKU and stock quantity', () => {
    const record = fromWooProduct({
      id: 2461,
      name: 'Himalayan Pink Salt',
      slug: 'pink-salt',
      type: 'variable',
      status: 'publish',
      regular_price: '',
      sale_price: '',
      sku: '',
      stock_status: 'instock',
      stock_quantity: null,
      manage_stock: false,
    });

    expect(record.price).toBeNull();
    expect(record.sku).toBeNull();
    expect(record.stockQuantity).toBeNull();
    expect(record.type).toBe('variable');
    expect(record.stockStatus).toBe('instock');
  });

  it('reads the store availability status honestly', () => {
    expect(fromWooProduct({ id: 1, stock_status: 'outofstock' }).stockStatus).toBe('outofstock');
    expect(fromWooProduct({ id: 1, stock_status: 'nonsense' }).stockStatus).toBe('unknown');
    expect(fromWooProduct({ id: 1 }).stockStatus).toBe('unknown');
  });

  it('reads persisted admin metadata and dimensions without inventing values', () => {
    const record = fromWooProduct({
      id: 2497,
      dimensions: { length: '40', width: '30', height: '20' },
      weight: '45',
      meta_data: [
        { key: '_himalayan_koh_cost_price', value: '25' },
        { key: '_himalayan_koh_landed_cost', value: '25' },
        { key: '_himalayan_koh_package_preset', value: 'custom' },
        { key: '_himalayan_koh_seo_keywords', value: '["rock salt"]' },
        { key: '_himalayan_koh_canonical_slug', value: 'himalayan-rock-salt-45-lbs-2-3-large-chunks' },
      ],
    });
    expect(record.costPrice).toBe(25);
    expect(record.landedCost).toBe(25);
    expect(record.packagePreset).toBe('custom');
    expect(record.dimensions).toEqual({ length: 40, width: 30, height: 20 });
    expect(record.seoKeywords).toEqual(['rock salt']);
    expect(record.canonicalSlug).toBe('himalayan-rock-salt-45-lbs-2-3-large-chunks');
  });

  it('reports the storefront imagery the store holds no record of', () => {
    // Product 2484 as the store reports it: a published product with no gallery
    // image at all, whose product page nonetheless shows four photographs (the
    // app-shipped defaults). Before this field the editor could not tell that
    // apart from a product with one placeholder image.
    const record = fromWooProduct({
      id: 2484,
      name: 'Himalayan Salt Block — 30 lbs',
      slug: 'himalayan-salt-block-30-lbs',
      sku: 'HK-LB-30LBS',
      status: 'publish',
      images: [],
    });

    expect(record.images).toEqual([]);
    expect(record.storefrontDefaultImages).toHaveLength(4);
    expect(record.storefrontDefaultImages[0]).toBe('/images/products/himalayan-salt-block-30lbs-hero.webp');
  });

  it('does not report a default twice when the gallery already holds that URL', () => {
    // The storefront's own overlay de-duplicates by URL, so an image that is in
    // both places is one image to a customer and must count as one here.
    const shared = '/images/products/himalayan-salt-lick-rope-hero.webp';
    const record = fromWooProduct({
      id: 2487,
      slug: 'himalayan-salt-lick-5-to-6-lbs',
      sku: 'HK-LFH-6lbs',
      images: [{ src: shared }, { src: 'https://himalayankoh.com/staging/wp-content/uploads/2022/04/lick-4.jpg' }],
    });

    expect(record.images).toHaveLength(2);
    expect(record.storefrontDefaultImages).toHaveLength(4);
    expect(record.storefrontDefaultImages).not.toContain(shared);
  });

  it('claims no storefront-only imagery for a product the curated map does not cover', () => {
    const record = fromWooProduct({
      id: 2479,
      slug: 'himalayan-pink-edible-salt-16-oz-jar',
      sku: 'HK-ESC-16oz',
      images: [{ src: 'https://himalayankoh.com/staging/wp-content/uploads/2024/08/jar.jpeg' }],
    });

    expect(record.storefrontDefaultImages).toEqual([]);
  });

  it('treats a non-publish status as not listed', () => {
    expect(fromWooProduct({ id: 1, status: 'draft' }).isListed).toBe(false);
    expect(fromWooProduct({ id: 1, status: 'trash' }).isListed).toBe(false);
    expect(fromWooProduct({ id: 1, status: 'publish' }).isListed).toBe(true);
  });
});

describe('variationPriceRange', () => {
  it('prefers a variation sale price over its regular price', () => {
    expect(
      variationPriceRange([
        { regular_price: '17.95', sale_price: '9.25' },
        { regular_price: '49.95' },
      ])
    ).toEqual({ min: 9.25, max: 49.95 });
  });

  it('reports one price for a single-priced product', () => {
    expect(variationPriceRange([{ regular_price: '9.95' }, { regular_price: '9.95' }])).toEqual({
      min: 9.95,
      max: 9.95,
    });
  });

  it('is null when no variation reports a price', () => {
    expect(variationPriceRange([{ regular_price: '' }, {}])).toBeNull();
    expect(variationPriceRange([])).toBeNull();
  });
});

describe('variationLabel', () => {
  it('joins the option values a customer chooses between', () => {
    expect(
      variationLabel({ id: 1, attributes: [{ option: 'Fine Grain' }, { option: '6 lbs' }] })
    ).toBe('Fine Grain / 6 lbs');
  });

  it('falls back to the variation id rather than showing nothing', () => {
    expect(variationLabel({ id: 2450, attributes: [] })).toBe('Variation 2450');
  });
});

/**
 * The console's own product fields — everything WooCommerce has no column for.
 *
 * These pin the two halves of "a field either saves or is reported": the table
 * that gives each field a `meta_data` home, and the report that names a key no
 * layer can store.
 */
describe('the console\u2019s own product fields', () => {
  const metaOf = (body: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      (body.meta_data as Array<{ key: string; value: string }>).map((entry) => [entry.key, entry.value])
    );

  it('stores every console field under its documented meta key', () => {
    const body = toWooProductBody({
      supplierSource: 'Zeedrop',
      supplierUrl: 'https://supplier.example/item/1',
      promoted: true,
      saleEnabled: false,
      shippingCost: 8.5,
      freeShipping: false,
      features: ['Fine grain', 'Food grade'],
      specifications: { weightOz: 720, packagePreset: 'BOX_BAG_45' },
      listingEndsAt: '2026-10-31T00:00:00.000Z',
    });

    const meta = metaOf(body);
    expect(meta['_himalayan_koh_supplier_source']).toBe('Zeedrop');
    expect(meta['_himalayan_koh_supplier_url']).toBe('https://supplier.example/item/1');
    expect(meta['_himalayan_koh_promoted']).toBe('yes');
    expect(meta['_himalayan_koh_sale_enabled']).toBe('no');
    expect(meta['_himalayan_koh_shipping_cost']).toBe('8.5');
    expect(meta['_himalayan_koh_free_shipping']).toBe('no');
    expect(meta['_himalayan_koh_features']).toBe('["Fine grain","Food grade"]');
    expect(meta['_himalayan_koh_specifications']).toBe('{"weightOz":720,"packagePreset":"BOX_BAG_45"}');
    expect(meta['_himalayan_koh_listing_ends_at']).toBe('2026-10-31T00:00:00.000Z');
    // One `meta_data` write, shared with the economics that already lived there.
    expect(body.meta_data).toHaveLength(Object.keys(meta).length);
  });

  it('sends nothing for a console field the caller did not touch', () => {
    const body = toWooProductBody({ supplierSource: 'Zeedrop' });
    expect(body.meta_data).toEqual([{ key: '_himalayan_koh_supplier_source', value: 'Zeedrop' }]);
  });

  it('reads them back with their types, and omits what the store does not hold', () => {
    const record = fromWooProduct({
      id: 2497,
      meta_data: [
        { key: '_himalayan_koh_promoted', value: 'yes' },
        { key: '_himalayan_koh_sale_enabled', value: 'no' },
        { key: '_himalayan_koh_shipping_cost', value: '8.5' },
        { key: '_himalayan_koh_features', value: '["Fine grain"]' },
        { key: '_himalayan_koh_risk_flags', value: '["price_unverified"]' },
        { key: '_himalayan_koh_specifications', value: '{"weightOz":720}' },
        { key: '_himalayan_koh_owner_notes', value: 'Repack in 45 lb bags' },
      ],
    });

    expect(record.consoleFields).toEqual({
      promoted: true,
      saleEnabled: false,
      shippingCost: 8.5,
      features: ['Fine grain'],
      riskFlags: ['price_unverified'],
      specifications: { weightOz: 720 },
      ownerNotes: 'Repack in 45 lb bags',
    });
    // Absent is not `false`: a field nobody ever stored must stay absent, so the
    // console keeps its own default instead of reading a fabricated no.
    expect('trending' in record.consoleFields).toBe(false);
    expect('freeShipping' in record.consoleFields).toBe(false);
  });

  it('round-trips every field in the table, in both directions', () => {
    const sample = (kind: string): unknown =>
      kind === 'boolean'
        ? true
        : kind === 'number'
          ? 12.5
          : kind === 'stringList'
            ? ['alpha', 'beta']
            : kind === 'json'
              ? { weightOz: 720 }
              : 'value';

    const patch: Record<string, unknown> = {};
    for (const entry of CONSOLE_META_FIELDS) patch[entry.field] = sample(entry.kind);

    const body = toWooProductBody(patch);
    const record = fromWooProduct({
      id: 1,
      meta_data: body.meta_data as Array<{ key: string; value: unknown }>,
    });

    for (const entry of CONSOLE_META_FIELDS) {
      expect(record.consoleFields[entry.field], `${entry.field} did not survive the store`).toEqual(
        sample(entry.kind)
      );
    }
  });

  it('names the fields nobody can store instead of dropping them in silence', () => {
    expect(unsupportedProductWriteFields({ name: 'Salt', ownerNotes: 'note' })).toEqual([]);
    expect(unsupportedProductWriteFields({ name: 'Salt', futureField: 1 })).toEqual([
      { field: 'futureField', reason: expect.stringContaining('no field') },
    ]);
    // `variations` rides on the product PUT and is accepted only there.
    expect(unsupportedProductWriteFields({ variations: [] })).toHaveLength(1);
    expect(unsupportedProductWriteFields({ variations: [] }, ['variations'])).toEqual([]);
  });

  it('keeps the accepted list, the console table and the meta keys in step', () => {
    for (const entry of CONSOLE_META_FIELDS) {
      // Every console field must be accepted by the routes, or it is refused on
      // arrival — the drift that let the editor send thirty-one fields no layer
      // could store.
      expect(PRODUCT_WRITE_FIELDS).toContain(entry.field);
    }
    expect(new Set(PRODUCT_WRITE_FIELDS).size).toBe(PRODUCT_WRITE_FIELDS.length);
    expect(new Set(CONSOLE_META_FIELDS.map((entry) => entry.key)).size).toBe(CONSOLE_META_FIELDS.length);
    // …and nothing outside the table may claim to be one of its keys.
    for (const entry of CONSOLE_META_FIELDS) expect(entry.key.startsWith('_himalayan_koh_')).toBe(true);
  });
});

describe('toWooVariationBody', () => {
  it('only sends the fields a variation edit touched', () => {
    expect(toWooVariationBody({ regularPrice: 12.5 })).toEqual({ regular_price: '12.50' });
  });

  it('clears a variation price on null, which is how a sale ends', () => {
    expect(toWooVariationBody({ salePrice: null })).toEqual({ sale_price: '' });
  });

  it('stores the rest of the Variants tab: low-stock level and supplier cost', () => {
    expect(toWooVariationBody({ lowStockAmount: 3, costPrice: 12 })).toEqual({
      low_stock_amount: 3,
      meta_data: [{ key: '_himalayan_koh_cost_price', value: '12' }],
    });
  });
});

/**
 * The Variants tab's price columns.
 *
 * The table has a Price and a Compare column; only the price reached the store,
 * so a sale set on a variation was a number the console showed and nobody was
 * charged.
 */
describe('variationPriceFields', () => {
  it('reads a compare-at as the list price and the price as what is charged', () => {
    expect(variationPriceFields({ price: 20, compareAtPrice: 25 })).toEqual({
      regularPrice: 25,
      salePrice: 20,
    });
  });

  it('clears a sale when the price is edited without one', () => {
    expect(variationPriceFields({ price: 20 })).toEqual({ regularPrice: 20, salePrice: null });
    expect(variationPriceFields({ price: 20, compareAtPrice: null })).toEqual({
      regularPrice: 20,
      salePrice: null,
    });
  });

  it('sends nothing when neither column was touched', () => {
    expect(variationPriceFields({})).toEqual({});
  });
});

describe('unsupportedVariationWriteFields', () => {
  it('accepts every field the Variants tab owns', () => {
    expect(
      unsupportedVariationWriteFields({
        id: 2450,
        regularPrice: 20,
        salePrice: null,
        sku: 'HK-V-1',
        manageStock: true,
        stockQuantity: 4,
        stockStatus: 'instock',
        costPrice: 9,
        lowStockAmount: 2,
      }),
    ).toEqual([]);
  });

  it('names an option set the store cannot be given', () => {
    expect(unsupportedVariationWriteFields({ id: 2450, attributes: [{ name: 'Size', option: 'L' }] })).toEqual([
      { field: 'attributes', reason: expect.stringContaining('no variation field') },
    ]);
  });
});
