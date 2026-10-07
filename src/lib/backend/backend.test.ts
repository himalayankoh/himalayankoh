import { describe, expect, it } from 'vitest';

import { backendConfig, describeReadiness } from './config';
import { describeBackendReadiness, wooCredentials } from './credentials';
import { buildQueryString, toBodySnippet, WordPressApiError } from './wordpress';
import { looksLikeHtml, looksLikeWordPressFatal } from './wordpressFatal.mjs';
import {
  htmlToText,
  isPurchasable,
  mapRestV3Product,
  mapStoreProduct,
  mapWpCoreProduct,
  normalizeStockStatus,
  parseMajorUnitPrice,
  parseMinorUnitPrice,
  type StoreApiProduct,
  type WpCoreProduct,
} from './woocommerce';

/** The real body staging returns for /wc/store/v1/products. */
const WORDPRESS_FATAL_BODY = `<!DOCTYPE html>
<html lang="en-US">
<head><title>WordPress &rsaquo; Error</title></head>
<body id="error-page">
  <div class="wp-die-message"><p>There has been a critical error on this website.</p></div>
</body></html>`;

describe('parseMinorUnitPrice', () => {
  it('converts minor units to major units', () => {
    expect(parseMinorUnitPrice('1995', 2)).toBe(19.95);
    expect(parseMinorUnitPrice('100000', 2)).toBe(1000);
    expect(parseMinorUnitPrice('1995', 0)).toBe(1995);
  });

  it('returns null for absent or unusable values rather than guessing zero', () => {
    expect(parseMinorUnitPrice(undefined)).toBeNull();
    expect(parseMinorUnitPrice(null)).toBeNull();
    expect(parseMinorUnitPrice('')).toBeNull();
    expect(parseMinorUnitPrice('   ')).toBeNull();
    expect(parseMinorUnitPrice('not-a-price')).toBeNull();
  });
});

describe('parseMajorUnitPrice', () => {
  it('parses decimal strings and numbers', () => {
    expect(parseMajorUnitPrice('19.95')).toBe(19.95);
    expect(parseMajorUnitPrice(19.95)).toBe(19.95);
  });

  it('treats an empty string as unknown, not free', () => {
    expect(parseMajorUnitPrice('')).toBeNull();
    expect(parseMajorUnitPrice(undefined)).toBeNull();
    expect(parseMajorUnitPrice(null)).toBeNull();
  });
});

describe('normalizeStockStatus', () => {
  it('maps WooCommerce wording', () => {
    expect(normalizeStockStatus('instock')).toBe('in_stock');
    expect(normalizeStockStatus('outofstock')).toBe('out_of_stock');
    expect(normalizeStockStatus('onbackorder')).toBe('on_backorder');
  });

  it('leaves anything unrecognised as unknown', () => {
    expect(normalizeStockStatus(undefined)).toBe('unknown');
    expect(normalizeStockStatus('')).toBe('unknown');
    expect(normalizeStockStatus('maybe')).toBe('unknown');
  });
});

describe('isPurchasable', () => {
  it('requires a positive stock report', () => {
    expect(isPurchasable('in_stock')).toBe(true);
    expect(isPurchasable('on_backorder')).toBe(true);
    expect(isPurchasable('out_of_stock')).toBe(false);
    // An unreported stock status must never silently enable checkout.
    expect(isPurchasable('unknown')).toBe(false);
  });
});

describe('htmlToText', () => {
  it('strips tags and decodes the entities WordPress emits', () => {
    expect(htmlToText('<p>Salt &amp; Pepper</p>')).toBe('Salt & Pepper');
    expect(htmlToText('<div>a</div>\n<div>b</div>')).toBe('a b');
    expect(htmlToText('&nbsp; spaced ')).toBe('spaced');
  });

  it('reduces a product description to the sentence it carries', () => {
    // The product page renders the description as text, so WooCommerce's markup must
    // not survive into it: `<p>` used to appear verbatim in the copy on every PDP that
    // had one, which is the shape the store's descriptions all have.
    const fromWoo =
      '<p>Himalayan pink salt, fine 0.5–1.0 mm grain, 45 lb pack. Unrefined and additive-free.</p>';
    expect(htmlToText(fromWoo)).toBe(
      'Himalayan pink salt, fine 0.5–1.0 mm grain, 45 lb pack. Unrefined and additive-free.'
    );
    expect(htmlToText(undefined)).toBe('');
    expect(htmlToText('<ul><li>Fine</li><li>Coarse</li></ul>')).toBe('Fine Coarse');
    expect(htmlToText(undefined)).toBe('');
  });
});

describe('mapStoreProduct', () => {
  const base: StoreApiProduct = {
    id: 2461,
    name: 'Himalayan Koh Edible Pink Salt',
    slug: 'himalayan-koh-edible-salt-grain',
    permalink: 'https://example.test/product/salt/',
    sku: 'HK-EDIBLE-3LB',
    prices: { price: '1995', regular_price: '1995', sale_price: '', currency_code: 'USD', currency_minor_unit: 2 },
    images: [{ id: 2462, src: 'https://example.test/uploads/6-lbs-pouche.webp', alt: '' }],
    categories: [{ id: 75, name: 'Uncategorized', slug: 'uncategorized' }],
    description: '<p>Hand-mined pink salt.</p>',
    short_description: '<p>Fine grain.</p>',
    is_in_stock: true,
    is_featured: false,
  };

  it('reports a real price with no missing fields for price', () => {
    const product = mapStoreProduct(base);
    expect(product.priceMin).toBe(19.95);
    expect(product.price).toBe('$19.95');
    expect(product.missing).not.toContain('price');
  });

  it('keeps the responsive sizes the store publishes, keyed by image url', () => {
    const product = mapStoreProduct({
      ...base,
      images: [
        {
          id: 2462,
          src: 'https://example.test/uploads/6-lbs-pouche.webp',
          alt: '',
          srcset:
            'https://example.test/uploads/6-lbs-pouche.webp 573w, ' +
            'https://example.test/uploads/6-lbs-pouche-300x300.webp 300w, ' +
            'https://example.test/uploads/6-lbs-pouche-500x500.webp 500w',
        },
      ],
    });

    expect(product.imageResponsive).toEqual({
      'https://example.test/uploads/6-lbs-pouche.webp': {
        width: 573,
        tokens: ['300x300'],
      },
    });
  });

  it('omits responsive sizes entirely when the store publishes none', () => {
    expect(mapStoreProduct(base).imageResponsive).toBeUndefined();
  });

  it('never turns a discount into a variant price range', () => {
    // regular 19.95 / sale 14.95 is a discount, not a range.
    const product = mapStoreProduct({
      ...base,
      prices: { price: '1495', regular_price: '1995', sale_price: '1495', currency_code: 'USD', currency_minor_unit: 2 },
    });
    expect(product.priceMin).toBe(14.95);
    expect(product.priceMax).toBeUndefined();
    expect(product.priceRange).toBe(false);
  });

  it('reports price as unknown when the backend omits it', () => {
    const product = mapStoreProduct({ ...base, prices: undefined });
    expect(product.priceMin).toBeNull();
    expect(product.price).toBe('');
    expect(product.missing).toContain('price');
  });

  it('reports stock as unknown when is_in_stock is absent', () => {
    const product = mapStoreProduct({ ...base, is_in_stock: undefined });
    expect(product.stockStatus).toBe('unknown');
    expect(product.missing).toContain('stockStatus');
    expect(product.inStock).toBe(false);
  });

  it('distinguishes backorder and out-of-stock', () => {
    expect(mapStoreProduct({ ...base, is_in_stock: false }).stockStatus).toBe('out_of_stock');
    const backorder = mapStoreProduct({ ...base, is_on_backorder: true });
    expect(backorder.stockStatus).toBe('on_backorder');
    expect(backorder.inStock).toBe(true);
  });

  it('carries the unit count only when WooCommerce reports one', () => {
    expect(mapStoreProduct({ ...base, stock_availability: { remaining: 7 } }).stockQuantity).toBe(7);
    // A status without a count is not a count: an untracked product must not
    // come through as zero available.
    expect(mapStoreProduct({ ...base, stock_availability: { text: 'In stock' } }).stockQuantity).toBeNull();
    expect(mapStoreProduct(base).stockQuantity).toBeNull();
  });

  it('carries images and the category name through', () => {
    const product = mapStoreProduct(base);
    expect(product.images).toEqual(['https://example.test/uploads/6-lbs-pouche.webp']);
    expect(product.image).toBe('https://example.test/uploads/6-lbs-pouche.webp');
    expect(product.category).toBe('Uncategorized');
  });
});

describe('mapRestV3Product', () => {
  it('reads price, stock and sku — the fields the fatal Store API cannot return', () => {
    const product = mapRestV3Product({
      id: 2372,
      name: 'Himalayan Rock Salt Bag 18 lbs',
      slug: 'himalayan-rock-salt-bag',
      sku: 'HK-ROCK-18',
      price: '24.99',
      regular_price: '29.99',
      sale_price: '24.99',
      stock_status: 'instock',
      stock_quantity: 42,
      images: [{ id: 1, src: 'https://example.test/rock-salt.webp' }],
      categories: [{ id: 105, name: 'Bulk Order', slug: 'bulk-order' }],
      short_description: '<p>Coarse rock salt in a bulk bag.</p>',
    });

    expect(product.priceMin).toBe(24.99);
    expect(product.sku).toBe('HK-ROCK-18');
    expect(product.stockStatus).toBe('in_stock');
    expect(product.inStock).toBe(true);
    // REST v3 is the route that actually reports units, so the storefront's
    // quantity ceiling and the console's stock column read the same number.
    expect(product.stockQuantity).toBe(42);
    expect(product.category).toBe('Bulk Order');
    expect(product.missing).not.toContain('price');
  });

  it('keeps an untracked product count-less rather than zero', () => {
    expect(mapRestV3Product({ stock_quantity: null }).stockQuantity).toBeNull();
    expect(mapRestV3Product({}).stockQuantity).toBeNull();
  });

  it('falls back through price -> sale -> regular', () => {
    expect(mapRestV3Product({ price: '', sale_price: '9.50' }).priceMin).toBe(9.5);
    expect(mapRestV3Product({ price: '', sale_price: '', regular_price: '12.00' }).priceMin).toBe(12);
    expect(mapRestV3Product({}).priceMin).toBeNull();
  });
});

describe('mapWpCoreProduct', () => {
  it('never invents price, SKU or stock from the WordPress core route', () => {
    const raw: WpCoreProduct = {
      id: 286,
      slug: 'block-of-salt',
      link: 'https://example.test/product/block-of-salt/',
      featured_media: 2462,
      title: { rendered: 'Block of Salt' },
      content: { rendered: '<p>A big block.</p>' },
      excerpt: { rendered: '<p>Big block.</p>' },
      product_cat: [75],
      _embedded: { 'wp:featuredmedia': [{ source_url: 'https://example.test/block.webp' }] },
    };

    const product = mapWpCoreProduct(raw);

    expect(product.name).toBe('Block of Salt');
    expect(product.slug).toBe('block-of-salt');
    expect(product.image).toBe('https://example.test/block.webp');
    expect(product.priceMin).toBeNull();
    expect(product.price).toBe('');
    expect(product.sku).toBeNull();
    expect(product.stockStatus).toBe('unknown');
    expect(product.inStock).toBe(false);
    expect(product.missing).toEqual(expect.arrayContaining(['price', 'sku', 'stockStatus']));
  });

  it('reports an absent image instead of inventing one', () => {
    // No featured media on the post, so there is genuinely no image. The model
    // must say so rather than fall back to a bundled demo photo.
    const raw: WpCoreProduct = {
      id: 287,
      slug: 'salt-licks',
      title: { rendered: 'Salt Licks' },
      content: { rendered: '<p>Licks.</p>' },
    };

    const product = mapWpCoreProduct(raw);

    expect(product.image).toBe('');
    expect(product.missing).toContain('images');
    expect(product.name).toBe('Salt Licks');
  });
});

describe('WordPress fatal detection', () => {
  it('recognises the staging error page', () => {
    expect(looksLikeWordPressFatal(WORDPRESS_FATAL_BODY)).toBe(true);
    expect(looksLikeHtml(WORDPRESS_FATAL_BODY)).toBe(true);
  });

  it('does not mistake JSON for a fatal', () => {
    expect(looksLikeWordPressFatal('[{"id":1}]')).toBe(false);
    expect(looksLikeHtml('[{"id":1}]')).toBe(false);
    expect(looksLikeWordPressFatal('')).toBe(false);
  });

  it('carries the endpoint and status so the failure is actionable', () => {
    const error = new WordPressApiError({
      message: 'WordPress threw a PHP fatal error (HTTP 500) on /wc/store/v1/products.',
      path: '/wc/store/v1/products',
      status: 500,
      isWordPressFatal: true,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.isWordPressFatal).toBe(true);
    expect(error.path).toBe('/wc/store/v1/products');
    expect(error.status).toBe(500);
  });

  it('truncates bodies so logs stay readable', () => {
    expect(toBodySnippet('a'.repeat(500), 20)).toHaveLength(21);
    expect(toBodySnippet('  a\n\n b  ')).toBe('a b');
  });
});

describe('buildQueryString', () => {
  it('drops empty values and brackets arrays', () => {
    expect(buildQueryString({ per_page: 24, page: 1 })).toBe('?per_page=24&page=1');
    expect(buildQueryString({ a: undefined, b: null, c: '' })).toBe('');
    expect(buildQueryString({})).toBe('');
  });

  it('sends an array as `key[]` so the server reads every value, not the last one', () => {
    // Measured against the store: `/wc/v3/products?include=2721&include=2752` answers
    // with one product because PHP keeps the last value of a repeated key, while
    // `include[]=2721&include[]=2752` answers with both. A silently truncated filter is
    // worse than a rejected one — the shipping read treated the missing id as an
    // unknown product and refused to price the cart.
    expect(buildQueryString({ include: [2721, 2752] })).toBe('?include%5B%5D=2721&include%5B%5D=2752');
    expect(new URLSearchParams(buildQueryString({ include: [2721, 2752] })).getAll('include[]')).toEqual([
      '2721',
      '2752',
    ]);
  });
});

describe('backend configuration', () => {
  it('names one origin for the store, and no Supabase one', () => {
    // There is no data-source flag any more, so the only thing left to pin is
    // that the configuration speaks about WordPress and nothing else.
    expect(backendConfig).not.toHaveProperty('dataSource');
    expect(backendConfig.woocommerceBaseUrl).toBe(backendConfig.wordpressBaseUrl);
  });

  it('reports blockers instead of claiming the backend is ready', () => {
    const blocked = describeReadiness({ wordpressApiRoot: '', consumerKey: '', consumerSecret: '' });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toHaveLength(2);
    // Each blocker names the missing capability in owner-facing words. None of
    // them ships a server credential variable name: this string is rendered in
    // the admin console, so it is browser-bound.
    expect(blocked.blockers.join(' ')).toContain('origin');
    expect(blocked.blockers.join(' ')).toContain('WooCommerce REST credentials');
    expect(blocked.blockers.join(' ')).not.toContain('WOOCOMMERCE_CONSUMER');
    expect(blocked.blockers.join(' ')).not.toContain('WORDPRESS_BASE_URL');

    // Credentials alone are not enough: with no origin there is nothing to call.
    const halfConfigured = describeReadiness({
      wordpressApiRoot: '',
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
    });
    expect(halfConfigured.ready).toBe(false);
    expect(halfConfigured.blockers).toHaveLength(1);

    const ready = describeReadiness({
      wordpressApiRoot: 'https://example.test/staging/wp-json',
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
    });
    expect(ready.ready).toBe(true);
    expect(ready.blockers).toEqual([]);

    // The ambient wrapper must delegate to that same rule, not re-derive it.
    // It reads the credentials itself (they are no longer on `backendConfig`,
    // which browser code imports), so the expectation supplies the same pair.
    const credentials = wooCredentials();
    expect(describeBackendReadiness()).toEqual(
      describeReadiness({
        wordpressApiRoot: backendConfig.wordpressApiRoot,
        consumerKey: credentials?.username ?? '',
        consumerSecret: credentials?.password ?? '',
      })
    );
  });
});
