import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS } from './legacyRedirects';
import { NICHE_SECTIONS } from '../catalog/nicheSections';

/**
 * Routes this app actually serves. Kept explicit so a redirect can never point at
 * a page nobody built — which is exactly what happened once: the map pointed old
 * product URLs at hand-written slugs from the Supabase catalogue, and every one of
 * them 404'd after the catalogue moved to WooCommerce.
 */
const STATIC_ROUTES = new Set([
  '/',
  '/products',
  '/about',
  '/contact',
  '/blog',
  '/gallery',
  '/faqs',
  '/shipping',
  '/privacy',
  '/terms',
  '/return',
  '/returns',
  '/login',
  // The wholesale module the legacy `/whole-sale` page now points at. It is a
  // route this app serves (`src/app/(main)/wholesale/page.tsx`), so it belongs
  // in this list rather than staying unlisted and failing the check below.
  '/wholesale',
]);

/**
 * Product slugs the live catalogue serves today. A `/products/<slug>` destination
 * must name one of these; anything else is a link to a page this storefront will
 * not render.
 *
 * Read back from `GET https://himalayankoh.com/api/catalog` on 2026-10-11, after the
 * owner-approved preview catalog replacement re-slugged every product. The list
 * before that read was the Supabase-era catalogue's, so this test happily accepted
 * ten destinations that had been 404ing for a week — which is why the values are
 * now copied from the live API rather than from a migration document.
 */
const LIVE_PRODUCT_SLUGS = new Set([
  'himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh',
  'himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh',
  'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh',
  'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh',
  'himalayan-koh-authentic-pure-natural-halal-unprocessed-himalayan-edible-pink-cooking-salt-fine-grain-0-5mm-to-1mm-himalayan-koh',
  'himalayan-edible-pink-salt-16-oz-jar-fine-grain',
]);

const SHELF_KEYS = new Set<string>(NICHE_SECTIONS.map((section) => section.key));

/**
 * Paths this app renders itself (`find src/app -name page.tsx`). `redirects()`
 * runs before the filesystem in Next.js, so a legacy rule naming one of these
 * silently replaces a real page — which is exactly what happened to
 * `/checkout`: it was filed as a legacy WooCommerce URL next to `/cart`, and
 * every customer who pressed Checkout in the cart drawer was sent back to the
 * catalogue instead of to the page this repo builds for them.
 */
const APP_OWNED_PATHS = [
  '/',
  '/about',
  '/account',
  '/blog',
  '/checkout',
  '/checkout/cancel',
  '/checkout/failed',
  '/checkout/success',
  '/contact',
  '/faqs',
  '/forgot-password',
  '/gallery',
  '/login',
  '/privacy',
  '/products',
  '/reset-password',
  '/return',
  '/returns',
  '/shipping',
  '/signup',
  '/terms',
  '/track',
  '/wishlist',
];

describe('legacy redirect map', () => {
  it('never shadows a route this app serves', () => {
    const sources = new Set(LEGACY_REDIRECTS.map((rule) => rule.source));
    const shadowed = APP_OWNED_PATHS.filter((path) => sources.has(path));

    expect(shadowed).toEqual([]);
  });

  it('has no duplicate sources', () => {
    const sources = LEGACY_REDIRECTS.map((rule) => rule.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('never redirects a path to itself', () => {
    // A self-redirect is an infinite loop the browser reports as an error; the
    // app's own routes must not be listed as legacy sources.
    const loops = LEGACY_REDIRECTS.filter(
      (rule) => rule.source === rule.destination
    ).map((rule) => rule.source);

    expect(loops).toEqual([]);
  });

  it('only sends traffic to routes, shelves or live products', () => {
    const offenders = LEGACY_REDIRECTS.filter((rule) => {
      const [path, query] = rule.destination.split('?');
      if (path === '/products' && query) {
        const key = new URLSearchParams(query).get('category');
        return !key || !SHELF_KEYS.has(key);
      }
      if (path === '/products/:slug') return false;
      if (path.startsWith('/products/')) {
        return !LIVE_PRODUCT_SLUGS.has(path.replace('/products/', ''));
      }
      if (path.startsWith('/blog/')) return false;
      return !STATIC_ROUTES.has(path);
    });

    expect(offenders.map((rule) => `${rule.source} -> ${rule.destination}`)).toEqual([]);
  });

  it('keeps each prefix catch-all below the specific rules it would swallow', () => {
    const indexOf = (source: string) => LEGACY_REDIRECTS.findIndex((rule) => rule.source === source);

    // Next.js applies the first matching rule, so the `/product/:slug` catch-all
    // must sit below every literal `/product/...` rule or those products lose
    // their specific destination.
    const productCatchAll = indexOf('/product/:slug');
    const literalProducts = LEGACY_REDIRECTS
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => rule.source.startsWith('/product/') && !rule.source.includes(':'));
    expect(productCatchAll).toBeGreaterThan(Math.max(...literalProducts.map((p) => p.index)));

    // Same for the shop and service catch-alls.
    expect(indexOf('/shop/:slug*')).toBeGreaterThan(indexOf('/shop'));
    expect(indexOf('/services/:slug*')).toBeGreaterThan(indexOf('/services'));
  });

  it('maps the legacy wholesale page instead of letting it 404', () => {
    // `/whole-sale` was missing from the map entirely, so the indexed URL
    // redirected to the trailing-slash-stripped path and then answered 404.
    const rule = LEGACY_REDIRECTS.find((entry) => entry.source === '/whole-sale');
    expect(rule?.destination).toBe('/wholesale');
    expect(rule?.permanent).toBe(true);
  });

  it('sends livestock-intent legacy URLs to the shelves that actually hold those products', () => {
    // These all used to land on `cooking-serving`, `edible-pink-salt` or `bulk`,
    // none of which the live catalogue carries a product for — so a shopper
    // following an indexed link arrived at an empty grid.
    const expected: Record<string, string> = {
      '/services/fresh-dairy-products': '/products?category=live-stock',
      '/services/salt-for-live-stock': '/products?category=live-stock',
      '/services/salt-lick-for-horses': '/products?category=licks-blocks',
      '/services/salt-lumps-for-cattle': '/products?category=licks-blocks',
      '/why-do-dairy-cows-need-trace-minerals': '/products?category=live-stock',
      '/product/block-of-salt': '/products?category=licks-blocks',
      '/product/rock-of-salt': '/products?category=live-stock',
    };

    for (const [source, destination] of Object.entries(expected)) {
      const rule = LEGACY_REDIRECTS.find((entry) => entry.source === source);
      expect(rule?.destination, source).toBe(destination);
    }
  });

  it('never leaves a retired product URL to 404', () => {
    // The rule this replaces said "retired livestock products go to a shelf", which
    // was right while the map's product destinations had all gone stale but wrong
    // about the better answer: the catalogue still sells the horse lick and the
    // 45 lb bag, so those two URLs go to the product itself. What matters is that
    // none of them lands on a 404 — either a live product page or a shelf.
    const retired = [
      '/product/salt-licks-for-horses',
      '/product/salt-licks',
      '/product/bag-of-salt-for-livestock-45-lbs',
      '/product/himalayan-rock-salt-bag',
      '/product/himalayan-koh-edible-salt-grain',
      '/product/himalayan-edible-pink-salt',
      '/product/pouches',
      '/product/himalayan-salt-pouches',
      '/product/block-of-salt',
      '/product/rock-of-salt',
    ];

    for (const source of retired) {
      const rule = LEGACY_REDIRECTS.find((entry) => entry.source === source);
      expect(rule, `${source} should be mapped`).toBeDefined();

      const destination = rule!.destination;
      const slug = destination.startsWith('/products/') ? destination.replace('/products/', '') : null;
      const category = destination.startsWith('/products?category=')
        ? new URLSearchParams(destination.split('?')[1]).get('category')
        : null;

      const landsOnLiveProduct = slug !== null && LIVE_PRODUCT_SLUGS.has(slug);
      const landsOnShelf = category !== null && SHELF_KEYS.has(category);
      expect(
        landsOnLiveProduct || landsOnShelf,
        `${source} -> ${destination} is neither a live product nor a shelf`
      ).toBe(true);
    }
  });

  it('maps the app-spelled URL beside every WordPress product URL that lands on a product', () => {
    // WordPress served `/product/<slug>`; this app's own earlier catalogue served
    // `/products/<slug>`, and a crawl of this site indexed the second spelling. A
    // product URL that is only mapped in its WordPress spelling still 404s for the
    // visitor who followed the link that was actually indexed.
    const missing: string[] = [];

    for (const rule of LEGACY_REDIRECTS) {
      if (!rule.source.startsWith('/product/') || rule.source.includes(':')) continue;
      if (!rule.destination.startsWith('/products/')) continue;

      const slug = rule.source.replace('/product/', '');
      const twin = LEGACY_REDIRECTS.find((entry) => entry.source === `/products/${slug}`);
      if (!twin || twin.destination !== rule.destination) missing.push(slug);
    }

    expect(missing).toEqual([]);
  });

  it('never shadows a product the catalogue still sells', () => {
    // A redirect source naming a live slug would replace the product page with a
    // redirect — the same class of mistake as `/checkout` being listed as a legacy
    // URL, and one this map can only avoid by being checked against the live slugs.
    const shadowed = LEGACY_REDIRECTS.filter(
      (rule) =>
        rule.source.startsWith('/products/') &&
        LIVE_PRODUCT_SLUGS.has(rule.source.replace('/products/', ''))
    );

    expect(shadowed.map((rule) => rule.source)).toEqual([]);
  });
});
