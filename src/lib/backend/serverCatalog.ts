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
 * Scope a catalog read to what the storefront may serve, and say what was
 * withheld.
 *
 * The count is reported rather than hidden: the console shows the same figure, so
 * the owner learns from the storefront's own log that a product needs fixing
 * instead of wondering why a listing disappeared.
 */
function scopeToNiche(result: CatalogResult): CatalogResult {
  const excluded = countOffNicheProducts(result.products);
  if (excluded === 0) return result;

  const products = filterNicheProducts(result.products);
  return {
    products,
    count: Math.max(0, result.count - excluded),
    degraded: result.degraded,
    warnings: [
      ...result.warnings,
      `${excluded} product${excluded === 1 ? '' : 's'} outside the Himalayan pink salt niche ${excluded === 1 ? 'was' : 'were'} withheld from the storefront. Archive them in WooCommerce to remove this notice — see docs/HIMALAYAN-PINK-SALT-NICHE-AUDIT.md.`,
    ],
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
  readCatalogProducts(JSON.parse(key) as CatalogQuery)
);

/** The storefront's catalog: the source's catalog, scoped to the store's niche. */
export async function getCatalogProducts(query: CatalogQuery = {}): Promise<CatalogResult> {
  return scopeToNiche(await readCatalogForRequest(catalogQueryKey(query)));
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
  const lookup = await readCatalogProductBySlug(slug);

  if (
    lookup.product &&
    !isNicheProduct({
      id: lookup.product.id,
      sku: lookup.product.sku,
      name: lookup.product.name,
      category: lookup.product.category,
      description: lookup.product.description,
    })
  ) {
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
  const { products } = await readCatalogProducts({ perPage: limit, isFeatured: true });
  return filterNicheProducts(products).slice(0, limit);
});

export async function getFeaturedCatalogProducts(limit = 4): Promise<Product[]> {
  return readFeaturedForRequest(limit);
}
