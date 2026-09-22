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
]);

/**
 * Product slugs the WooCommerce catalogue serves today (see
 * `docs/PRODUCT-MIGRATION-MATRIX.md`). A `/products/<slug>` destination must name
 * one of these; anything else is a link to a page this storefront will not render.
 */
const LIVE_PRODUCT_SLUGS = new Set([
  'himalayan-koh-edible-salt-grain',
  'himalayan-edible-pink-salt',
  'pouches',
  'himalayan-salt-pouches',
  'himalayan-rock-salt-bag',
  'chef-himalayan-pink-salt',
  'himalayan-chef-himalayan-pink-salt-coarse-grain-jar-1-lbs',
  'himalayan-crystal-rock-salt-lamp-ionizer-air-purifier-with-dimmable-control',
  'himalayan-rock-salt-45-lbs-2-3-large-chunks',
  'salt-licks',
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

  it('sends every retired livestock product to a shelf, never to a product page', () => {
    const livestock = [
      '/product/salt-licks-for-horses',
      '/product/bag-of-salt-for-livestock-45-lbs',
      '/product/block-of-salt',
      '/product/rock-of-salt',
    ];

    for (const source of livestock) {
      const rule = LEGACY_REDIRECTS.find((entry) => entry.source === source);
      expect(rule, `${source} should be mapped`).toBeDefined();
      expect(rule?.destination.startsWith('/products?category=')).toBe(true);
    }
  });
});
