/**
 * Catalog adapters — the raw reads of the store.
 *
 * ## WooCommerce source
 * Read order, best data first:
 *   1. WooCommerce REST v3 — complete, needs consumer key/secret. Server-only.
 *   2. WooCommerce Store API — public and complete, but currently a PHP fatal.
 *   3. WordPress core `/wp/v2/product` — always available, reports NO price,
 *      NO SKU and NO stock.
 * Step 3 is a *degradation*: prices stay `null` and stock stays `'unknown'`, and
 * the reason lands in `warnings`. The bundled demo catalog is never used here, so
 * nothing invented can reach a WooCommerce-powered page.
 *
 * There is no second source. The `NEXT_PUBLIC_DATA_SOURCE` flag, the Supabase
 * adapter and the demo-catalog fallback that only the Supabase path used are all
 * gone: a storefront that could read one of two catalogs was a storefront that
 * could disagree with itself about which products exist.
 *
 * ## Two readers, on purpose
 * - **Raw** — `readCatalogProducts` / `readCatalogProductBySlug`. Everything the
 *   source reports, nothing withheld. The admin console reads this way, because
 *   the owner has to *see* an off-niche product in order to archive it.
 * - **Sealed** — `lib/backend/serverCatalog.ts`, which wraps these reads and drops
 *   what the storefront may not serve. Server renders and `/api/catalog` use it.
 *
 * ## The browser never reads a source
 * The browser's catalog client lives in `./catalogClient`, not here, and reads
 * `/api/catalog` — the sealed read served over HTTP. The split is deliberate:
 * when both lived in this file, the built output showed `/`, `/products` and
 * `/products/[slug]` loading a chunk that carried the WooCommerce client and its
 * credential reads. A component that reads the source itself would put withheld
 * products — names, categories, descriptions — on the wire and only drop them
 * afterwards, which is not the same as never sending them; and it would need the
 * source's credentials in the bundle. Nothing in this module may be imported by
 * client code.
 */

import type { Product } from '../../data/products';
import { normalizeProductSlug, slugsMatch } from '../products/slug';
import {
  fetchAdminProductBySlug,
  fetchAdminProducts,
  fetchStoreProductsSafe,
  fetchWpCoreProducts,
  RETIRED_PRODUCT_SLUGS,
} from './woocommerce';
import type { ProductQuery } from './woocommerce';

export interface CatalogQuery {
  perPage?: number;
  page?: number;
  slug?: string;
  search?: string;
  categorySlug?: string;
  isFeatured?: boolean;
  /**
   * Next.js data-cache window, in seconds, for this read.
   *
   * Absent means uncached, which is what the admin console wants. The storefront
   * read in `./serverCatalog` is the only caller that sets it.
   */
  revalidate?: number;
  signal?: AbortSignal;
}

export interface CatalogResult {
  products: Product[];
  count: number;
  /** True when the source could not fully serve the request and we fell back. */
  degraded: boolean;
  warnings: string[];
}

/** Where a resolved product came from, for the PDP's dev-mode diagnostics. */
export type CatalogProvenance = 'direct' | 'list-scan' | 'fallback-catalog';

export interface CatalogLookup {
  product: Product | null;
  related: Product[];
  provenance: CatalogProvenance | null;
  /** Exact backend error, when the lookup degraded. */
  error: string | null;
  /**
   * The record exists but the storefront must not serve it (off-niche, or under
   * an unapproved risk hold). Distinct from an unknown slug: a withheld product
   * is a real record the shop is declining to show, and the PDP answers 404 for
   * both — the flag exists so the two cases can be told apart without re-reading
   * the contract at the route.
   */
  withheld?: boolean;
}

function toProductQuery(query: CatalogQuery): ProductQuery {
  return {
    perPage: query.perPage ?? 24,
    page: query.page,
    slug: query.slug,
    search: query.search,
    category: query.categorySlug,
    featured: query.isFeatured,
    revalidate: query.revalidate,
    signal: query.signal,
  };
}

async function wooList(query: CatalogQuery): Promise<CatalogResult> {
  const warnings: string[] = [];

  try {
    const admin = await fetchAdminProducts(toProductQuery(query));
    if (admin) return { products: admin, count: admin.length, degraded: false, warnings: [] };
    warnings.push(
      'WooCommerce REST v3 skipped: WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET are not configured.'
    );
  } catch (error) {
    warnings.push(`WooCommerce REST v3 failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const store = await fetchStoreProductsSafe(toProductQuery(query));
  if (!store.error && store.products.length > 0) {
    return { products: store.products, count: store.products.length, degraded: false, warnings };
  }
  if (store.error) warnings.push(`WooCommerce Store API failed: ${store.error}`);

  const core = await fetchWpCoreProducts(toProductQuery(query));
  if (core.error) warnings.push(`WordPress core product fallback failed: ${core.error}`);
  warnings.push(
    'Showing WordPress-core product data only: price, SKU and stock are unavailable and are reported as unknown rather than inferred.'
  );

  return { products: core.products, count: core.products.length, degraded: true, warnings };
}

/**
 * One slug, resolved against the source with a strict final match.
 *
 * Deliberately knows nothing about retirements — the caller decides when a slug
 * should be translated to the product that replaced it. See `wooLookup`.
 */
async function resolveSlug(
  normalized: string,
  signal?: AbortSignal,
  revalidate?: number
): Promise<CatalogLookup> {
  try {
    const admin = await fetchAdminProductBySlug(normalized, signal, revalidate);
    if (admin) return { product: admin, related: [], provenance: 'direct', error: null };
  } catch {
    /* fall through to the public routes */
  }

  // Store API /wc/store/v1/products ignores the ?slug= parameter.
  // We match by slug or by numeric ID so that numeric ID or slug lookups resolve accurately.
  const store = await fetchStoreProductsSafe({ slug: normalized, perPage: 50, signal, revalidate });
  const isNumeric = /^\d+$/.test(normalized);
  const matchedStore = store.products.find(
    (p) => slugsMatch(p.slug, normalized) || (isNumeric && String(p.id) === normalized)
  );
  if (matchedStore) {
    return { product: matchedStore, related: [], provenance: 'direct', error: null };
  }

  // Same strict slug verification for WordPress core fallback products.
  const core = await fetchWpCoreProducts({ slug: normalized, perPage: 50, signal, revalidate });
  const matchedCore = core.products.find(
    (p) => slugsMatch(p.slug, normalized) || (isNumeric && String(p.id) === normalized)
  );
  if (matchedCore) {
    return { product: matchedCore, related: [], provenance: 'direct', error: core.error };
  }

  // No demo-catalog fallback: an unknown slug is genuinely unknown, and
  // inventing a product here would be the worst possible outcome.
  return { product: null, related: [], provenance: null, error: store.error };
}

/**
 * Resolve one slug, translating a *retired* slug only when the slug itself is gone.
 *
 * The order is the whole point, and it used to be the other way round: the
 * retirement map (`RETIRED_PRODUCT_SLUGS`) was applied to the slug *before* the
 * lookup, so a slug that was both a live product's own URL and a key in that map
 * could never resolve to itself. Two real URLs are in exactly that position —
 * `pouches` (the live 6 lb pouches, id 2321) and `himalayan-edible-pink-salt`
 * (the live 16 oz jar, id 2446) — and both are mapped onto curated products that
 * exist only on the staging install. So on the live backend those two product
 * pages asked for a substitute that is not there and answered 404, while the
 * catalogue listed both products and linked straight at them.
 *
 * Asking for the slug as given first fixes that without weakening the retirement:
 * a retired slug whose product genuinely no longer exists still falls through to
 * the substitute on the second attempt, and `fetchAdminProductBySlug` keeps its
 * own successor fallback for the credentialed path.
 */
async function wooLookup(
  slug: string,
  signal?: AbortSignal,
  revalidate?: number
): Promise<CatalogLookup> {
  const normalized = normalizeProductSlug(slug);
  if (!normalized) return { product: null, related: [], provenance: null, error: null };

  const direct = await resolveSlug(normalized, signal, revalidate);
  if (direct.product) return direct;

  const successor = RETIRED_PRODUCT_SLUGS[normalized];
  if (!successor || successor === normalized) return direct;

  return resolveSlug(successor, signal, revalidate);
}

/* ------------------------------------------------------------------ */
/* Raw reads (admin, and the sealed server read)                        */
/* ------------------------------------------------------------------ */

/**
 * The catalog exactly as the source reports it, with nothing withheld.
 *
 * This is the admin's read: a product that is off-niche is still a product the
 * owner has to archive, so it must arrive. Storefront reads go through the sealed
 * wrapper in `./serverCatalog` instead.
 */
export async function readCatalogProducts(query: CatalogQuery = {}): Promise<CatalogResult> {
  return wooList(query);
}

/** The catalog's answer for one slug, straight from the source. */
export async function readCatalogProductBySlug(
  slug: string,
  signal?: AbortSignal,
  revalidate?: number
): Promise<CatalogLookup> {
  return wooLookup(slug, signal, revalidate);
}
