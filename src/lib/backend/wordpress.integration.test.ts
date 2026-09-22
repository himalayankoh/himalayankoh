/**
 * Live integration test against the real WordPress/WooCommerce origin.
 *
 * Skipped unless BACKEND_INTEGRATION=1 and the WooCommerce source is selected,
 * so `npm test` stays hermetic and CI never depends on a third-party site being
 * up:
 *
 *   BACKEND_INTEGRATION=1 NEXT_PUBLIC_DATA_SOURCE=woocommerce \
 *     NEXT_PUBLIC_WORDPRESS_BASE_URL=https://himalayankoh.com/staging npm test
 *
 * `NEXT_PUBLIC_WORDPRESS_BASE_URL` (not the server-only `WORDPRESS_BASE_URL`) is
 * the one that matters for these reads: the storefront resolves product-by-slug
 * in a client component, so a deployment that sets only the server variable
 * renders a correct sitemap and an empty grid.
 *
 * Read-only by construction: the backend layer only issues GET requests. This
 * test never writes to WordPress, WooCommerce, their database, orders or
 * customers.
 *
 * Its real job is to prove the honesty contract end to end: when staging cannot
 * report a price, the model must carry `priceMin: null` and the UI label must
 * say so — never a fabricated number, SKU or stock state. Every number below was
 * observed from a live run rather than assumed, and the store is the same
 * staging store; if it changes size, this test should fail and be updated
 * deliberately.
 *
 * The second job is the niche contract: the storefront read serves Himalayan
 * pink salt only, while the admin read still delivers the whole staging catalog —
 * including the three animal-feed products the owner has to archive — so the two
 * views differ on purpose rather than by accident.
 */

import { describe, expect, it } from 'vitest';

import { readCatalogProducts } from './products';
import { getCatalogProducts, lookupCatalogProduct } from './serverCatalog';
import { fetchStoreProductsSafe } from './woocommerce';
import { wordpressRequestSafe } from './wordpress';
import { backendConfig } from './config';
import { formatPriceDisplay } from '../products/price';
import type { Product } from '../../data/products';

const enabled = process.env.BACKEND_INTEGRATION === '1';

/** Real WordPress media on the staging install — never a placeholder. */
const STAGING_MEDIA = /^https:\/\/himalayankoh\.com\/staging\/wp-content\/uploads\//;

/** The exact slug the storefront was exercised with, as a browser requested it. */
const OBSERVED_SLUG = 'himalayan-koh-edible-salt-grain';

/**
 * The staging catalog as counted live on 2026-09-17: 11 published products, of
 * which 3 are livestock feed and 1 more is a pink-salt pouch whose *description*
 * sells it for livestock (see docs/HIMALAYAN-PINK-SALT-NICHE-AUDIT.md).
 */
const STAGING_PRODUCT_COUNT = 11;
const STAGING_SALT_PRODUCT_COUNT = 7;

/** Slugs of the three products whose name or category is off-niche. */
const OFF_NICHE_SLUGS = ['salt-licks', 'salt-licks-for-horses', 'block-of-salt'];

/**
 * The fourth withheld product, and the reason it is withheld.
 *
 * Its name, its category and its slug are all in-niche — it was served for as
 * long as the guard judged name and category alone. Its description opens
 * "Elevate Livestock Well-being ... your animals", and a description is rendered,
 * so it is judged too. This is the case that keeps the guard honest about *what a
 * visitor actually sees* rather than about how a product is filed.
 */
const OFF_NICHE_BY_COPY_SLUG = 'pouches';

function expectNothingInvented(product: Product) {
  // The contract, asserted for every product rather than behind a condition:
  // a commercial field is either a real reported value or explicitly unknown.
  expect(product.name.length).toBeGreaterThan(0);
  expect(product.slug.length).toBeGreaterThan(0);
  expect(product.priceMin).toBeNull();
  expect(product.priceMax ?? null).toBeNull();
  expect(product.price).toBe('');
  expect(product.sku).toBeNull();
  expect(product.stockStatus).toBe('unknown');
  expect(product.inStock).toBe(false);
  expect(formatPriceDisplay(product)).toBe('Price unavailable');
  expect(product.missing).toEqual(expect.arrayContaining(['price', 'sku', 'stockStatus']));

  // An image is real staging media, or explicitly absent.
  if (product.image) {
    expect(product.image).toMatch(STAGING_MEDIA);
  } else {
    expect(product.missing).toContain('images');
  }
}

describe.skipIf(!enabled)('live WooCommerce backend', () => {
  it('is pointed at a configured origin', () => {
    expect(backendConfig.wordpressApiRoot).toMatch(/^https:\/\//);
  });

  it('reports the Store API product route as a WordPress fatal, not a parse error', async () => {
    const store = await fetchStoreProductsSafe({ perPage: 1 });

    // Observed live: HTTP 500 with an HTML error page. The browser therefore
    // sees a failed CORS fetch and the layer records a typed error. The previous
    // version of this test passed in both branches — `if (store.error) … else …`
    // with an always-true alternate — so it could not fail and proved nothing.
    expect(store.error).not.toBeNull();
    expect(store.products).toEqual([]);
  });

  it('still serves WordPress content and pages', async () => {
    const pages = await wordpressRequestSafe<unknown[]>('/wp/v2/pages', { params: { per_page: 1 } });
    expect(pages.error).toBeNull();
  });

  it('serves only the pink salt slice of the staging catalog', async () => {
    const { products, count, degraded, warnings } = await getCatalogProducts({ perPage: 100 });

    // 11 published products, minus the 3 livestock-feed ones and the pouch whose
    // copy addresses the feed trade.
    expect(products.length).toBe(STAGING_SALT_PRODUCT_COUNT);
    expect(count).toBe(STAGING_SALT_PRODUCT_COUNT);

    // We are on the WordPress-core fallback, and the layer says so — plus it now
    // reports the products it withheld and why.
    expect(degraded).toBe(true);
    expect(warnings.some((warning) => /outside the Himalayan pink salt niche/.test(warning))).toBe(
      true
    );

    // Every product: real identity, real media, nothing commercial invented.
    for (const product of products) {
      expectNothingInvented(product);
    }

    // Slugs come from WordPress, not from the bundled demo catalog.
    expect(products.map((p) => p.slug)).toContain(OBSERVED_SLUG);

    // No animal-feed product reaches a storefront read — by slug, by name or by
    // category — which is what keeps them off the grid, the search, the related
    // products, the sitemap and the structured data at once.
    const slugs = products.map((p) => p.slug);
    for (const offNiche of OFF_NICHE_SLUGS) {
      expect(slugs).not.toContain(offNiche);
    }
    expect(slugs).not.toContain(OFF_NICHE_BY_COPY_SLUG);

    // Nothing a visitor would see names the animal trade — and that includes the
    // copy, because the copy is what the payload ships.
    for (const product of products) {
      expect(`${product.name} ${product.category} ${product.description ?? ''}`).not.toMatch(
        /livestock|herd|horse|cattle|deer|animal feed|\blicks?\b/i
      );
    }

    // WordPress slugs are unique, so a pagination or merge bug cannot silently
    // render the same product twice.
    expect(new Set(slugs).size).toBe(products.length);
  });

  it('still hands the admin the whole staging catalog, off-niche products included', async () => {
    const { products } = await readCatalogProducts({ perPage: 100 });

    // The console is where the owner archives or rewrites these, so it must see
    // them — including the one whose only fault is its copy, which the owner
    // fixes with a single field edit.
    expect(products.length).toBe(STAGING_PRODUCT_COUNT);
    const slugs = products.map((p) => p.slug);
    for (const offNiche of [...OFF_NICHE_SLUGS, OFF_NICHE_BY_COPY_SLUG]) {
      expect(slugs).toContain(offNiche);
    }
  });

  it('withholds a product whose copy alone is off-niche, and not one whose copy is clean', async () => {
    // The copy-only case: an in-niche name, category and slug, and a description
    // written for farmers.
    const withheld = await lookupCatalogProduct(OFF_NICHE_BY_COPY_SLUG);
    expect(withheld.product).toBeNull();

    // And the control: the same shape of product with clean copy is served, so the
    // rule is about the copy and not about the product being a pouch.
    const served = await lookupCatalogProduct(OBSERVED_SLUG);
    expect(served.product).not.toBeNull();
  });

  it('resolves a withheld slug to nothing rather than to an animal-feed page', async () => {
    // A shared or indexed link is the likeliest way one of these would otherwise
    // still be reachable from the storefront.
    const lookup = await lookupCatalogProduct('salt-licks');

    expect(lookup.product).toBeNull();
  });

  it('resolves a real staging product by slug with its real image', async () => {
    const lookup = await lookupCatalogProduct(OBSERVED_SLUG);

    // Asserted unconditionally: the previous version wrapped this in
    // `if (lookup.product)`, so a null product made the test pass while the
    // capability it was named for was broken.
    expect(lookup.error).toBeNull();
    expect(lookup.product).not.toBeNull();
    expect(lookup.provenance).toBe('direct');

    const product = lookup.product!;
    expect(product.slug).toBe(OBSERVED_SLUG);
    expect(product.name.length).toBeGreaterThan(0);
    expect(product.image).toMatch(STAGING_MEDIA);
    expectNothingInvented(product);
  });

  it('returns null rather than a fabricated product for an unknown slug', async () => {
    const lookup = await lookupCatalogProduct('this-slug-does-not-exist-hk-000');
    expect(lookup.product).toBeNull();
    expect(lookup.provenance).toBeNull();
  });
});
