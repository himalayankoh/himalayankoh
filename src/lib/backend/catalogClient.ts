/**
 * The storefront's catalog client, for **browser** code only.
 *
 * This module exists as its own file because of what happens when it shares one
 * with the source adapters: measured on the built output, `/`, `/products` and
 * `/products/[slug]` all loaded a shared chunk containing the WooCommerce client —
 * `/wc/store/v1/products`, an authenticated `/wc/v3/products` call and the
 * `WOOCOMMERCE_CONSUMER_KEY` / `_SECRET` config reads. Nothing called it from the
 * browser, but shipping it there is two failures at once: source code the
 * storefront is not supposed to have on the client, and a bundle that invites the
 * next component to read the source directly instead of through the server.
 *
 * What the browser may do is read `/api/catalog` — the server's already-scoped
 * answer. A component that read the source itself would put withheld products
 * (names, categories, descriptions) on the wire and only drop them afterwards,
 * which is not the same as never sending them, and it would need the source's
 * credentials in the bundle.
 *
 * So the split is: adapters and raw reads in `./products` (server, admin),
 * sealed storefront reads in `./serverCatalog` (server), and this — the only
 * catalog module a client component may import.
 */

import type { Product } from '../../data/products';
import { invalidateSharedReads, readShared } from '../catalog/readCache';
import type { CatalogLookup, CatalogQuery, CatalogResult } from './products';

/** Where the browser gets its catalog. */
const CATALOG_ENDPOINT = '/api/catalog';

/** Called on the server, these would silently read nothing. Say so instead. */
function assertBrowser(): void {
  if (typeof window === 'undefined') {
    throw new Error(
      'The storefront catalog client is browser-only. Server code reads through lib/backend/serverCatalog (sealed) or readCatalogProducts (raw, admin).'
    );
  }
}

function catalogEndpointUrl(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${CATALOG_ENDPOINT}?${query}` : CATALOG_ENDPOINT;
}

async function fetchCatalogJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`The catalog endpoint answered ${response.status}.`);
  }
  return (await response.json()) as T;
}

/**
 * The storefront's catalog, in the browser: one shared read of the server's
 * answer.
 *
 * `readShared` shares an in-flight request between components and reuses the
 * answer for a short window, so navigating between catalogue surfaces does not
 * re-read the catalogue on every mount.
 */
export async function getCatalogProducts(query: CatalogQuery = {}): Promise<CatalogResult> {
  assertBrowser();

  const key = JSON.stringify({
    perPage: query.perPage ?? null,
    page: query.page ?? null,
    search: query.search ?? null,
    categorySlug: query.categorySlug ?? null,
    isFeatured: query.isFeatured ?? null,
  });

  // A caller that can abort expects its own request; a cache would hand it a
  // promise it cannot cancel and keep the result afterwards.
  return readShared(
    `catalog:${key}`,
    () =>
      fetchCatalogJson<CatalogResult>(
        catalogEndpointUrl({
          perPage: query.perPage,
          page: query.page,
          search: query.search,
          category: query.categorySlug,
          featured: query.isFeatured,
        }),
        query.signal
      ),
    { noStore: Boolean(query.signal) }
  );
}

/** One product by slug, in the browser. */
export async function lookupCatalogProduct(
  slug: string,
  signal?: AbortSignal
): Promise<CatalogLookup> {
  assertBrowser();

  try {
    return await fetchCatalogJson<CatalogLookup>(catalogEndpointUrl({ slug }), signal);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { product: null, related: [], provenance: null, error: reason };
  }
}

/** Featured products for the homepage, in the browser. */
export async function getFeaturedCatalogProducts(limit = 4): Promise<Product[]> {
  assertBrowser();

  try {
    const { products } = await readShared(`catalog:featured:${limit}`, () =>
      fetchCatalogJson<{ products: Product[] }>(catalogEndpointUrl({ featured: 1, limit }))
    );
    return products.slice(0, limit);
  } catch (error) {
    console.error('Featured products could not be read from the catalog endpoint.', error);
    return [];
  }
}

/**
 * Drop the browser cache of catalog reads.
 *
 * Called when the catalogue is known to have changed (a realtime product event),
 * so the next read is fresh instead of waiting out the TTL.
 */
export function invalidateCatalogReads(): void {
  invalidateSharedReads();
}
