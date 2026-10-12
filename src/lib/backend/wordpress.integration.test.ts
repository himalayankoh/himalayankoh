/**
 * Live integration test against the real WordPress/WooCommerce origin.
 *
 * Skipped unless BACKEND_INTEGRATION=1 and the WooCommerce source is selected, so
 * `npm test` stays hermetic and CI never depends on a third-party site being up:
 *
 *   npm run test:integration            # the origin .env.local configures
 *
 * `NEXT_PUBLIC_WORDPRESS_BASE_URL` (not the server-only `WORDPRESS_BASE_URL`) is the
 * one that matters for these reads: the storefront resolves product-by-slug in a
 * client component, so a deployment that sets only the server variable renders a
 * correct sitemap and an empty grid.
 *
 * Read-only by construction: the backend layer only issues GET requests. This test
 * never writes to WordPress, WooCommerce, their database, orders or customers.
 *
 * ## Two kinds of assertion, kept apart on purpose
 *
 * This file was written against the **staging** install, and every number in it — 11
 * published products, 7 in the pink-salt slice, the staging media prefix, the
 * Store-API WordPress fatal — was observed there. Run against the **production**
 * install it reported six failures, and not one of them was a defect: they were
 * staging's shape asserted against a store that is not staging, which is how a
 * configuration mistake came to look like a broken storefront.
 *
 * So the assertions are now in two groups, and the split is the point:
 *
 *   1. **Contracts** — the honesty rule (a commercial field is a real reported value
 *      or explicitly unknown, never a fabricated one), the niche rule (the storefront
 *      serves the pink-salt slice of what the admin reads), a withheld slug resolving
 *      to nothing, an unknown slug resolving to nothing. These are properties of the
 *      *code*, so they run against whatever origin is configured.
 *   2. **Catalogue shape** — the counts, slugs and media prefix that describe one
 *      particular install. These run only when that install is the one under test,
 *      and say so when they are skipped. Against production they would fail on the
 *      size of a store the code cannot control.
 *
 * `scripts/test-integration.mjs` classifies the origin and passes it down as
 * `HIMALAYAN_KOH_ORIGIN_KIND`, so the runner's line and this file's conditions come
 * from one decision rather than two regexes that can drift.
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

/** The origin these suites have observations for, and the one that is configured. */
const STAGING_ORIGIN = /^https:\/\/(?:wp\.)?himalayankoh\.com\/staging(?:\/|$)/;
const PRODUCTION_ORIGIN = /^https:\/\/(?:www\.)?(?:wp\.)?himalayankoh\.com(?:\/|$)/;

const configuredOrigin = (backendConfig.woocommerceBaseUrl || backendConfig.wordpressBaseUrl).replace(
  /\/+$/,
  ''
);
const originKind =
  process.env.HIMALAYAN_KOH_ORIGIN_KIND ||
  (STAGING_ORIGIN.test(configuredOrigin)
    ? 'staging'
    : PRODUCTION_ORIGIN.test(configuredOrigin)
      ? 'production'
      : 'unknown');
const isStaging = originKind === 'staging';
const isProduction = originKind === 'production';

/**
 * The staging catalogue as counted live on 2026-09-17: 11 published products, of
 * which 3 are livestock feed and 1 more is a pink-salt pouch whose *description*
 * sells it for livestock (see docs/HIMALAYAN-PINK-SALT-NICHE-AUDIT.md).
 */
const STAGING_PRODUCT_COUNT = 11;
const STAGING_SALT_PRODUCT_COUNT = 7;

/** Real WordPress media on the staging install — never a placeholder. */
const STAGING_MEDIA = /^https:\/\/himalayankoh\.com\/staging\/wp-content\/uploads\//;

/** The exact slug the storefront was exercised with, as a browser requested it. */
const OBSERVED_SLUG = 'himalayan-koh-edible-salt-grain';

/** Slugs of the three products whose name or category is off-niche. */
const OFF_NICHE_SLUGS = ['salt-licks', 'salt-licks-for-horses', 'block-of-salt'];

/**
 * The fourth withheld product, and the reason it is withheld.
 *
 * Its name, its category and its slug are all in-niche — it was served for as long as
 * the guard judged name and category alone. Its description opens "Elevate Livestock
 * Well-being ... your animals", and a description is rendered, so it is judged too.
 * This is the case that keeps the guard honest about *what a visitor actually sees*
 * rather than about how a product is filed.
 */
const OFF_NICHE_BY_COPY_SLUG = 'pouches';

if (enabled && !isStaging) {
  // Printed rather than silent: a reader who expected the staging numbers to run needs
  // to know they were not asserted here, and why.
  console.log(
    `[integration] configured origin is ${configuredOrigin} (${originKind}); the staging catalogue-shape ` +
      `assertions (${STAGING_PRODUCT_COUNT} published products, ${STAGING_SALT_PRODUCT_COUNT} in the pink-salt ` +
      `slice, staging media URLs, the Store-API fatal) describe https://himalayankoh.com/staging and are skipped. ` +
      'The contracts below run on any origin.'
  );
}

/**
 * The honesty rule, for any origin: every commercial field is either a value the
 * store really reported, or explicitly unknown — and nothing in the model claims more
 * than its own fields do.
 *
 * Written as a choice rather than as "everything must be unknown" (which is what the
 * first version asserted, and is only true while staging cannot report a price) so the
 * contract holds on an install that *can* report one, and still fails a model that
 * invents a number, a SKU or a stock state.
 */
function expectHonestCommercialFields(product: Product) {
  expect(product.name.length).toBeGreaterThan(0);
  expect(product.slug.length).toBeGreaterThan(0);

  const hasPrice = product.priceMin !== null && product.priceMin !== undefined;
  if (hasPrice) {
    expect(Number.isFinite(product.priceMin as number)).toBe(true);
    expect(Number(product.priceMin)).toBeGreaterThan(0);
    expect(product.price).not.toBe('');
    expect(formatPriceDisplay(product)).not.toBe('Price unavailable');
  } else {
    // No price reported: the display string must not imply one, and the model has to
    // say which field it could not read.
    expect(product.price).toBe('');
    expect(formatPriceDisplay(product)).toBe('Price unavailable');
    expect(product.missing).toContain('price');
  }

  if (product.sku !== null && product.sku !== undefined) {
    expect(String(product.sku).length).toBeGreaterThan(0);
  } else {
    expect(product.missing).toContain('sku');
  }

  // The union is the storefront's own (`src/data/products.ts`): WooCommerce's
  // `instock`/`outofstock` spellings are mapped on the way in, so asserting the raw
  // WooCommerce strings here would assert the wrong vocabulary and pass on nothing.
  expect(['in_stock', 'out_of_stock', 'on_backorder', 'unknown']).toContain(product.stockStatus);
  if (product.stockStatus === 'unknown') {
    expect(product.inStock).toBe(false);
    expect(product.missing).toContain('stockStatus');
  } else {
    // A known state and the boolean beside it must agree, in both directions.
    expect(product.inStock).toBe(product.stockStatus === 'in_stock');
  }

  // An image is a real URL, or explicitly absent.
  if (product.image) {
    expect(product.image).toMatch(/^https:\/\//);
    if (isStaging) expect(product.image).toMatch(STAGING_MEDIA);
  } else {
    expect(product.missing).toContain('images');
  }
}

/**
 * The shape observed on the staging install: the Store-API fatal means no commercial
 * field can be reported at all, and the contract there is that each one is *declared*
 * unknown rather than shown as zero.
 */
function expectDegradedCommerce(product: Product) {
  expect(product.priceMin).toBeNull();
  expect(product.priceMax ?? null).toBeNull();
  expect(product.price).toBe('');
  expect(product.sku).toBeNull();
  expect(product.stockStatus).toBe('unknown');
  expect(product.inStock).toBe(false);
  expect(formatPriceDisplay(product)).toBe('Price unavailable');
  expect(product.missing).toEqual(expect.arrayContaining(['price', 'sku', 'stockStatus']));
}

describe.skipIf(!enabled)('live backend contracts (any origin)', () => {
  it('is pointed at a configured origin', () => {
    console.log(`[integration] origin ${configuredOrigin} classified as ${originKind}`);
    expect(backendConfig.wordpressApiRoot).toMatch(/^https:\/\//);
  });

  it('still serves WordPress content and pages', async () => {
    const pages = await wordpressRequestSafe<unknown[]>('/wp/v2/pages', { params: { per_page: 1 } });
    expect(pages.error).toBeNull();
  });

  it('answers the Store API product route with an answer or a named failure, never a silent nothing', async () => {
    const store = await fetchStoreProductsSafe({ perPage: 1 });

    // Two states are legitimate, and they are opposite ones. Staging answers HTTP 500
    // with a WordPress fatal, which the layer records as a typed error beside an empty
    // list (observed live; the previous version of this test passed in both branches,
    // so it proved nothing). An install that works answers products. What must never
    // happen is products *and* an error, or neither — a caller that silently receives
    // nothing is the failure this test exists for.
    if (store.error) {
      expect(store.products).toEqual([]);
      expect(String(store.error).length).toBeGreaterThan(0);
      console.log(`[integration] Store API on ${configuredOrigin}: typed failure — ${String(store.error).slice(0, 160)}`);
    } else {
      console.log(`[integration] Store API on ${configuredOrigin}: ${store.products.length} product(s) readable`);
    }

    // Exactly one of the two, never both and never neither.
    const hasError = Boolean(store.error);
    const hasProducts = store.products.length > 0;
    expect(hasError).not.toBe(hasProducts);
  });

  it('serves the storefront only the pink-salt slice of what the admin reads', async () => {
    const storefront = await getCatalogProducts({ perPage: 100 });
    const admin = await readCatalogProducts({ perPage: 100 });

    console.log(
      `[integration] catalogue on ${configuredOrigin}: storefront ${storefront.count}, admin ${admin.products.length}` +
        `${storefront.degraded ? ' (degraded read — the store could not report commercial fields)' : ''}`
    );

    // The relationship, which is a property of the code and holds wherever it runs.
    expect(storefront.count).toBeGreaterThan(0);
    expect(storefront.count).toBeLessThanOrEqual(admin.products.length);
    expect(admin.products.length).toBeGreaterThan(0);

    const adminSlugs = admin.products.map((product) => product.slug);
    const storefrontSlugs = storefront.products.map((product) => product.slug);
    for (const slug of storefrontSlugs) {
      expect(adminSlugs).toContain(slug);
    }

    // Nothing a visitor would see names the animal trade — on the install whose
    // catalogue that describes.
    //
    // Measured against production on 2026-10-12, this is not a contract the code holds:
    // 4 of the 5 products that install serves name the trade in their own name or
    // category ("…Salt Lick for Cattle" / "Salt Licks" / "…for Livestock" / "Live
    // Stock"), because this store sells livestock salt and those listings are published
    // on purpose — the owner-approval package corrects their *copy* (§A3) rather than
    // withdrawing them. So the blanket copy rule is a statement about the staging
    // catalogue (11 products, 3 of them livestock feed withheld). What the code actually
    // holds is the blocklist asserted below, and that assertion stays unconditional.
    const ANIMAL_TRADE = /livestock|herd|horse|cattle|deer|animal feed|\blicks?\b/i;
    const namingTheTrade = storefront.products.filter((product) =>
      ANIMAL_TRADE.test(`${product.name} ${product.category} ${product.description ?? ''}`)
    );
    if (isStaging) {
      expect(namingTheTrade.map((product) => product.slug)).toEqual([]);
    } else {
      console.log(
        `[integration] ${originKind}: ${namingTheTrade.length} served product(s) name the animal trade ` +
          `(${namingTheTrade.map((product) => product.slug).join(', ') || 'none'}) — expected on this ` +
          'install, and the blocklist assertion below is what is checked here'
      );
    }

    // No animal-feed product reaches a storefront read — by slug, by name or by
    // category — which is what keeps them off the grid, the search, the related
    // products, the sitemap and the structured data at once.
    for (const offNiche of [...OFF_NICHE_SLUGS, OFF_NICHE_BY_COPY_SLUG]) {
      expect(storefrontSlugs).not.toContain(offNiche);
    }

    // WordPress slugs are unique, so a pagination or merge bug cannot silently render
    // the same product twice.
    expect(new Set(storefrontSlugs).size).toBe(storefrontSlugs.length);

    // Every product: real identity, a real image or none, nothing commercial invented.
    for (const product of storefront.products) {
      expectHonestCommercialFields(product);
    }
  });

  it(
    'resolves a withheld slug to nothing rather than to an animal-feed page',
    async () => {
      // A shared or indexed link is the likeliest way one of these would otherwise still
      // be reachable from the storefront. True on any origin: where the product does not
      // exist at all, the answer is the same one.
      //
      // One live round trip per slug, and the default 5 s budget cannot cover a loop of
      // three: measured against production on 2026-10-12 a single lookup takes 3.2–5.6 s,
      // so this failed as a timeout while the behaviour under test was correct. The
      // budget is raised; the assertion is untouched.
      for (const slug of OFF_NICHE_SLUGS) {
        const lookup = await lookupCatalogProduct(slug);
        expect(lookup.product, slug).toBeNull();
      }
    },
    30_000
  );

  it('resolves a product it serves by slug, with its real image', async () => {
    // The slug is taken from what this origin actually served rather than from a
    // staging observation, so the assertion still means something wherever it runs.
    const { products } = await getCatalogProducts({ perPage: 100 });
    const served = products[0];
    expect(served).toBeDefined();

    const lookup = await lookupCatalogProduct(served.slug);

    // Asserted unconditionally: the previous version wrapped this in
    // `if (lookup.product)`, so a null product made the test pass while the capability
    // it was named for was broken.
    expect(lookup.error).toBeNull();
    expect(lookup.product).not.toBeNull();
    expect(lookup.provenance).toBe('direct');

    const product = lookup.product!;
    expect(product.slug).toBe(served.slug);
    expect(product.name.length).toBeGreaterThan(0);
    expectHonestCommercialFields(product);
  });

  it('returns null rather than a fabricated product for an unknown slug', async () => {
    const lookup = await lookupCatalogProduct('this-slug-does-not-exist-hk-000');
    expect(lookup.product).toBeNull();
    expect(lookup.provenance).toBeNull();
  });
});

/**
 * The staging install's own shape.
 *
 * Every expectation here is a measurement of one store, so it is asserted only while
 * that store is the origin under test. Nothing in this block is a contract of the
 * code; a change here means the staging catalogue changed, and updating these numbers
 * is a deliberate act rather than a repaired failure.
 */
describe.skipIf(!enabled || !isStaging)('staging catalogue shape', () => {
  it('is the staging install these numbers were observed on', () => {
    expect(configuredOrigin).toMatch(STAGING_ORIGIN);
  });

  it('reports the Store API product route as a WordPress fatal, not a parse error', async () => {
    const store = await fetchStoreProductsSafe({ perPage: 1 });

    // Observed live on staging: HTTP 500 with an HTML error page. The browser therefore
    // sees a failed CORS fetch and the layer records a typed error.
    expect(store.error).not.toBeNull();
    expect(store.products).toEqual([]);
  });

  it('serves only the pink salt slice of the staging catalogue, and nothing commercial invented', async () => {
    const { products, count, degraded, warnings } = await getCatalogProducts({ perPage: 100 });

    // 11 published products, minus the 3 livestock-feed ones and the pouch whose copy
    // addresses the feed trade.
    expect(products.length).toBe(STAGING_SALT_PRODUCT_COUNT);
    expect(count).toBe(STAGING_SALT_PRODUCT_COUNT);

    // Staging is on the WordPress-core fallback, and the layer says so — plus it
    // reports the products it withheld and why.
    expect(degraded).toBe(true);
    expect(warnings.some((warning) => /outside the Himalayan pink salt niche/.test(warning))).toBe(true);

    // Slugs come from WordPress, not from the bundled demo catalog, and the media is
    // this install's own.
    expect(products.map((product) => product.slug)).toContain(OBSERVED_SLUG);
    for (const product of products) {
      expectDegradedCommerce(product);
      expectHonestCommercialFields(product);
    }
  });

  it('hands the admin the whole staging catalog, off-niche products included', async () => {
    const { products } = await readCatalogProducts({ perPage: 100 });

    // The console is where the owner archives or rewrites these, so it must see them —
    // including the one whose only fault is its copy, which the owner fixes with a
    // single field edit.
    expect(products.length).toBe(STAGING_PRODUCT_COUNT);
    const slugs = products.map((product) => product.slug);
    for (const offNiche of [...OFF_NICHE_SLUGS, OFF_NICHE_BY_COPY_SLUG]) {
      expect(slugs).toContain(offNiche);
    }
  });

  it('withholds a product whose copy alone is off-niche, and not one whose copy is clean', async () => {
    // The copy-only case: an in-niche name, category and slug, and a description
    // written for farmers.
    const withheld = await lookupCatalogProduct(OFF_NICHE_BY_COPY_SLUG);
    expect(withheld.product).toBeNull();

    // And the control: the same shape of product with clean copy is served, so the rule
    // is about the copy and not about the product being a pouch.
    const served = await lookupCatalogProduct(OBSERVED_SLUG);
    expect(served.product).not.toBeNull();

    const product = served.product!;
    expect(product.image).toMatch(STAGING_MEDIA);
  });
});

/**
 * The production install's own shape.
 *
 * Kept deliberately thin, and deliberately *relational*: the production catalogue
 * changes whenever the owner edits a listing, so a count asserted here would fail on a
 * sale rather than on a defect. What is asserted is the absence of the failure staging
 * has, and that the reads answer with a catalogue at all; the counts are printed so a
 * change is visible without being a false alarm.
 */
describe.skipIf(!enabled || !isProduction)('production catalogue shape', () => {
  it('answers the Store API product route, which is where staging has a WordPress fatal', async () => {
    const store = await fetchStoreProductsSafe({ perPage: 5 });
    console.log(
      `[integration] production Store API: ${store.error ? `failure — ${String(store.error).slice(0, 160)}` : `${store.products.length} product(s)`}`
    );
    expect(store.error).toBeNull();
    expect(store.products.length).toBeGreaterThan(0);
  });

  it('serves a catalogue in both reads, and identical commercial honesty in each', async () => {
    const storefront = await getCatalogProducts({ perPage: 100 });
    const admin = await readCatalogProducts({ perPage: 100 });

    console.log(
      `[integration] production catalogue: storefront ${storefront.count}, admin ${admin.products.length}, degraded=${storefront.degraded}`
    );

    // Measured, not fixed: the storefront may serve fewer products than the admin read
    // (the niche guard is allowed to withhold) but never more, and never none.
    expect(storefront.count).toBeGreaterThan(0);
    expect(storefront.count).toBeLessThanOrEqual(admin.products.length);

    for (const product of storefront.products) {
      expectHonestCommercialFields(product);
    }
  });
});
