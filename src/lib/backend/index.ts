/**
 * Backend abstraction layer.
 *
 * The single source of catalog data: WordPress/WooCommerce. Application code
 * imports from here rather than from a WordPress client directly, so the
 * storefront has one seam to read the store through. See
 * docs/WORDPRESS-WOOCOMMERCE-MIGRATION.md.
 *
 * Only the names the app actually calls are re-exported. The layer's internals
 * stay reachable by direct import for tests and diagnostics, so the public
 * surface here stays small enough to audit.
 *
 * ## This barrel is an admin surface, not a storefront one
 * It re-exports the admin read model, which imports the niche guard so it can
 * report what the storefront withheld. Importing this barrel from a public view
 * therefore drags the guard into a chunk every visitor downloads — measured, not
 * theoretical: it did, in a 33 kB chunk shared by `/`, `/products` and
 * `/products/[slug]`.
 *
 * So: **storefront code imports its modules directly** — `./catalogClient` for the
 * browser catalog client — and this barrel is for the console. Sealed server
 * reads are in `./serverCatalog`.
 */

/**
 * The storefront catalog client for *browser* code: it reads `/api/catalog`.
 *
 * Server code reads the sealed catalog through `./serverCatalog` — importing it
 * directly, not through this barrel, so that no client component's import graph
 * can pull the niche guard into a bundle it does not belong in. Calling one of
 * these three from the server throws with that instruction rather than silently
 * reading nothing.
 */
export {
  getCatalogProducts,
  getFeaturedCatalogProducts,
  invalidateCatalogReads,
  lookupCatalogProduct,
} from './catalogClient';

export type { CatalogLookup, CatalogQuery, CatalogResult } from './products';

export {
  ADMIN_CATALOG_PER_PAGE,
  readAdminCatalogPage,
  readAdminCatalogStats,
  type AdminCatalogFacet,
  type AdminCatalogPage,
  type AdminCatalogQuery,
  type AdminCatalogRow,
  type AdminCatalogSort,
  type AdminCatalogStats,
} from './adminCatalog';
