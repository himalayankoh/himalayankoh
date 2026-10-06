/**
 * Which destinations the router is allowed to fetch before the shopper asks.
 *
 * Next's `Link` fetches a link's route as soon as the link enters the viewport.
 * On a static page that is free, and on a shop like this one it is the single
 * most expensive thing the storefront does.
 *
 * Measured on the preview deployment (2026-10-06, cold edge, real browser):
 * simply rendering `/products` issued eight route fetches before anything was
 * clicked. The two product links in the first row took **6.19 s and 6.25 s**, the
 * `live-stock` shelf took **6.57 s** and the `edible-pink-salt` shelf **6.33 s**.
 * The homepage did the same thing to its two shelf links, at **4.27 s and 4.37 s**.
 *
 * None of that is a rendering cost. Each prefetch is a full server render that
 * reads WooCommerce, and the WordPress origin behind this shop answers one read in
 * about 0.9 s but degrades to 2.5-3 s at eight concurrent reads (measured on the
 * same day: 1 request 0.83-1.01 s, 8 concurrent 2.53-3.00 s). So a page view fired
 * four to eight of them at once, the origin serialised them, and the product
 * photos, the cart call and the secondary data the visitor *is* waiting for all
 * queued behind work nobody asked for.
 *
 * ## What this does not do
 *
 * It does not remove client-side navigation, and it does not touch a route that is
 * cheap. A prefetch is refused only where the destination is a dynamic commerce
 * route: a product page, a filtered shelf, or a private route whose answer is
 * never shared. Static marketing pages keep Next's own behaviour, which is what
 * makes a click on the footer feel instant, and several of them already opt out
 * individually.
 *
 * A refused prefetch costs the visitor a real navigation instead of a guessed one,
 * and that navigation is served from the edge in about 0.1 s once the page is warm
 * (`/products` was measured at 44 ms TTFB, its first cold render at 1.24 s). The
 * trade is deliberate: one honest fetch when asked, instead of eight speculative
 * renders when not.
 */

import { pathOnly } from './locationMatch';

/**
 * Routes whose answer is generated for one visitor, or is never shared at all.
 *
 * These are the cart, checkout and account surfaces. They are not edge-cacheable
 * (their responses carry `no-store`), so a speculative fetch is a guaranteed
 * origin round trip for a page most visitors never open.
 */
const PRIVATE_PREFIXES = ['/admin', '/account', '/cart', '/checkout', '/order-confirmation', '/login'];

/**
 * The catalogue's own prefix.
 *
 * `/products` with no query is a single edge-cached listing and stays prefetchable,
 * because it is the destination of the main "Shop all" call to action. Everything
 * below it, and every filtered form of it, is a distinct server render.
 */
const CATALOG_PREFIX = '/products';

/**
 * Query parameters that make a catalogue URL its own uncached render.
 *
 * `?category=` is the shelf the sitemap and the category pills point at, `search`
 * and `sort` are free text, and `page` walks the listing. Each is a different key
 * in the edge cache, so the first visitor to reach one pays the full origin read.
 */
const CATALOG_QUERY_KEYS = ['category', 'search', 'sort', 's', 'page', 'featured', 'min', 'max'];

/** True when the destination leaves this site, or is not a route at all. */
function isExternalOrAnchor(destination: string): boolean {
  return (
    destination === '' ||
    destination.startsWith('#') ||
    destination.startsWith('mailto:') ||
    destination.startsWith('tel:') ||
    /^[a-z][a-z0-9+.-]*:/i.test(destination) ||
    destination.startsWith('//')
  );
}

/**
 * Whether Next may fetch this destination as soon as its link is visible.
 *
 * `true` leaves Next's own behaviour in place. `false` means the route is only
 * fetched once the visitor actually navigates to it.
 */
export function shouldPrefetchOnViewport(destination: string): boolean {
  if (typeof destination !== 'string' || isExternalOrAnchor(destination)) return false;

  // A query-only destination (`?category=…`) is written in place by the router
  // shim rather than fetched as a route, so there is nothing here to prefetch.
  if (destination.startsWith('?')) return false;

  const path = pathOnly(destination);
  if (!path.startsWith('/')) return false;

  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }

  if (path === CATALOG_PREFIX) {
    // The plain listing is one shared, edge-cached page; a filtered one is not.
    const query = destination.includes('?') ? destination.slice(destination.indexOf('?') + 1) : '';
    return !CATALOG_QUERY_KEYS.some((key) => new RegExp(`(^|&)${key}=`).test(query));
  }

  // A product page under `/products/<slug>`: its own render, its own edge entry,
  // and a WooCommerce read behind it.
  if (path.startsWith(`${CATALOG_PREFIX}/`)) return false;

  return true;
}
