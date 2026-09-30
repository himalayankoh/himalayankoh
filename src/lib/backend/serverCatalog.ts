/**
 * The storefront's sealed catalog read — **server only**.
 *
 * This module is the seam where the shop's niche is enforced, and it exists as
 * its own module so the enforcement can never travel to a browser: the guard
 * (`lib/catalog/niche.ts`) is imported here and nowhere the client graph reaches.
 *
 * Two rules follow from that, and both are deliberate:
 *
 * 1. **Only server code imports this file.** Server renders (`/products`,
 *    `/products/[slug]` metadata and JSON-LD, `/sitemap.xml`) and `/api/catalog`
 *    import it. Client components import the browser client in `./products`, which
 *    reads `/api/catalog` — the answer this module produces, already scoped.
 * 2. **Nothing here is a source read.** The adapters live in `./products`
 *    (`readCatalogProducts`, `readCatalogProductBySlug`); this module wraps them
 *    and is the only thing that decides what the public may see. The admin console
 *    keeps reading the raw adapters, because the owner has to *see* an off-niche
 *    product in order to archive it.
 *
 * The guard judges a product's name, its category and **its own copy**. Copy is
 * included because it is rendered, and because staging proved the case: a
 * neutrally named, neutrally filed pouch product carried a description that
 * opened "Elevate Livestock Well-being ... your animals", and that description was
 * being serialised into the catalogue payload of every visitor.
 */

import { cache } from 'react';
import type { Product } from '../../data/products';
import { storefrontListingReason } from '../../features/catalog/storefrontListing';
import { countOffNicheProducts, filterNicheProducts, isNicheProduct } from '../catalog/niche';
import {
  readCatalogProductBySlug,
  readCatalogProducts,
  type CatalogLookup,
  type CatalogQuery,
  type CatalogResult,
} from './products';
import { normalizeProductSlug } from '../products/slug';

/**
 * How long a public storefront read of the catalogue may be reused.
 *
 * Every storefront route read WooCommerce on every render, and one read costs the
 * origin roughly 900 ms (measured 2026-09-29: a bare `/wp-json/` request is 805 ms
 * and a single `/wc/v3/products` read 861–1032 ms, with repeats just as slow). So
 * the catalogue, a product page and the blog all answered in about a second, and
 * the same request was paid again for every visitor, every navigation and every
 * `<Link>` prefetch. This window lets that read be reused by the data cache
 * (Cloudflare KV through `kvDataAdapter`, see vite.config.ts) instead.
 *
 * Sixty seconds is a boundary, not a guess:
 *
 *  - Browsing may be up to a minute stale; buying is not. Add-to-cart, cart
 *    recalculation and checkout read WooCommerce directly and uncached, and
 *    WooCommerce refuses a quantity it cannot stock, so a stale catalogue cannot
 *    oversell. The failure mode here is a price or stock figure that is at most a
 *    minute old on a listing — never a wrong order.
 *  - The admin console does not use this window. It reads the raw adapters in
 *    `./products`, which stay uncached, because the owner has to see the row they
 *    just saved.
 *  - Anything private — cart, checkout, account, orders, wholesale — goes through
 *    other modules entirely and keeps its own `no-store`.
 *
 * Raising it is a trade, not a free win: the longer the window, the longer a price
 * correction takes to reach a listing.
 */
export const STOREFRONT_READ_TTL_SECONDS = 60;

/**
 * Scope a catalog read to what the storefront may serve, and say what was
 * withheld.
 *
 * The count is reported rather than hidden: the console shows the same figure, so
 * the owner learns from the storefront's own log that a product needs fixing
 * instead of wondering why a listing disappeared.
 */
function scopeToStorefront(result: CatalogResult): CatalogResult {
  // Two policies, both enforced here and nowhere else the public can reach:
  //   1. the niche guard — *what the shop sells*;
  //   2. the shared public contract — *whether the commerce facts are verified*.
  // The second was documented as the PDP's fail-closed gate but was never wired
  // into this read, so a product stamped RISK_REVIEW was served to customers
  // while the console counted it as not listable. Now one read decides both.
  const nicheExcluded = countOffNicheProducts(result.products);
  const nicheKept = filterNicheProducts(result.products);
  const readinessWithheld = nicheKept.filter((p) => storefrontListingReason(p) !== null);
  if (nicheExcluded === 0 && readinessWithheld.length === 0) return result;

  const products = nicheKept.filter((p) => storefrontListingReason(p) === null);
  const withheld = nicheExcluded + readinessWithheld.length;
  const warnings = [...result.warnings];
  if (nicheExcluded > 0) {
    warnings.push(
      `${nicheExcluded} product${nicheExcluded === 1 ? '' : 's'} outside the Himalayan pink salt niche ${nicheExcluded === 1 ? 'was' : 'were'} withheld from the storefront. Archive them in WooCommerce to remove this notice — see docs/HIMALAYAN-PINK-SALT-NICHE-AUDIT.md.`,
    );
  }
  if (readinessWithheld.length > 0) {
    warnings.push(
      `${readinessWithheld.length} product${readinessWithheld.length === 1 ? '' : 's'} ${readinessWithheld.length === 1 ? 'was' : 'were'} withheld because commerce readiness is incomplete (source, cost, fulfillment or risk review). Finish the readiness checklist in the admin console to list them.`,
    );
  }
  return {
    products,
    count: Math.max(0, result.count - withheld),
    degraded: result.degraded,
    warnings,
  };
}

/**
 * A stable cache key for a catalog query.
 *
 * Only the fields that change the answer are included, so two callers asking for
 * the same page of the same catalogue share one read, and a caller that passes an
 * equivalent query in a different object shape still hits it.
 */
function catalogQueryKey(query: CatalogQuery): string {
  return JSON.stringify({
    perPage: query.perPage ?? null,
    page: query.page ?? null,
    slug: query.slug ?? null,
    search: query.search ?? null,
    categorySlug: query.categorySlug ?? null,
    isFeatured: query.isFeatured ?? null,
  });
}

/**
 * Per-request memo for the read.
 *
 * `/products` reads the catalogue twice in one request — once for the metadata
 * (the category noindex decision, the AggregateOffer price range) and once for
 * the page — and the sitemap reads it too. Without this memo each of those issued
 * its own upstream request chain. React's `cache` scopes the result to the current
 * request, so two renders in the same request share a read while a later request
 * always re-reads: stock stays fresh, and nothing is cached across visitors.
 */
const readCatalogForRequest = cache(async (key: string): Promise<CatalogResult> =>
  readCatalogProducts({
    ...(JSON.parse(key) as CatalogQuery),
    revalidate: STOREFRONT_READ_TTL_SECONDS,
  })
);

/** The storefront's catalog: the source's catalog, scoped to the shop's policies. */
export async function getCatalogProducts(query: CatalogQuery = {}): Promise<CatalogResult> {
  return scopeToStorefront(await readCatalogForRequest(catalogQueryKey(query)));
}

/**
 * Resolves one product by slug, or resolves *nothing*.
 *
 * An off-niche product resolves to nothing rather than to itself: a direct hit is
 * how a link, a search result or a shared URL would otherwise reach a product the
 * storefront is not allowed to serve. Name, category and copy are all judged,
 * because all three are what the page would show.
 *
 * Wrapped in React cache() so generateMetadata and Page share a single lookup
 * during the same server request instead of issuing duplicate network calls.
 */
const lookupProductForRequest = cache(async (slug: string): Promise<CatalogLookup> => {
  const lookup = await readCatalogProductBySlug(slug, undefined, STOREFRONT_READ_TTL_SECONDS);

  if (!lookup.product) return lookup;

  const offNiche = !isNicheProduct({
    id: lookup.product.id,
    sku: lookup.product.sku,
    name: lookup.product.name,
    category: lookup.product.category,
    description: lookup.product.description,
  });
  // The PDP answers to both policies, exactly as the list read does: an off-niche
  // product, or one whose commerce facts are not verified, resolves to nothing
  // rather than to itself.
  if (offNiche || storefrontListingReason(lookup.product) !== null) {
    return { product: null, related: [], provenance: null, error: lookup.error };
  }

  return lookup;
});

export async function lookupCatalogProduct(
  slug: string,
  _signal?: AbortSignal
): Promise<CatalogLookup> {
  const normalized = normalizeProductSlug(slug) || slug.trim().toLowerCase();
  return lookupProductForRequest(normalized);
}

/**
 * Featured products for the homepage.
 *
 * One code path for both sources: a featured read is an ordinary catalog read
 * narrowed by `isFeatured`, so it inherits the same memoisation and the same
 * guard instead of being a second, differently-shaped query that can drift.
 */
const readFeaturedForRequest = cache(async (limit: number): Promise<Product[]> => {
  const { products } = await readCatalogProducts({
    perPage: limit,
    isFeatured: true,
    revalidate: STOREFRONT_READ_TTL_SECONDS,
  });
  return filterNicheProducts(products)
    .filter((p) => storefrontListingReason(p) === null)
    .slice(0, limit);
});

export async function getFeaturedCatalogProducts(limit = 4): Promise<Product[]> {
  return readFeaturedForRequest(limit);
}
