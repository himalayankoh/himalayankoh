/**
 * Admin catalog read model.
 *
 * The admin panel and the storefront must never disagree about which products
 * exist. They did: the storefront read WooCommerce staging (11 products) while
 * `/admin` read the old Supabase rows (7), so the catalog had two owners. This
 * module removes that split by answering admin reads from the same seam the
 * storefront uses.
 *
 * It owns no queries of its own: it delegates to the catalog adapter
 * (`readCatalogProducts`), which is the read the storefront performs. The Supabase
 * branch that used to sit beside it is deleted — with one source there is nothing
 * to choose between, and nothing for the two to disagree about.
 *
 * ## Unknown is a value
 * Every field the store cannot report is `null` — price, SKU, stock, inventory
 * counts — and the UI renders that as unknown. Nothing is defaulted to zero,
 * because `0` is a price and a stock level, not a silence.
 */

import type { Product as CatalogProduct, StockStatus } from '../../data/products';
import { ADMIN_CATALOG_PER_PAGE } from '../admin/catalogPageSize';
import { countOffNicheProducts, isNicheProduct } from '../catalog/niche';
import { readCatalogProducts } from './products';
import { WORDPRESS_MAX_PER_PAGE } from './wordpress';
import { UNCATEGORIZED_CATEGORY } from './woocommerce';
import { fromWooProduct, type AdminProductRecord } from '../woo/productPayload';
import { isPublicWooStatus, type WooListingStatus } from '../woo/productStatus';
import { listWooProducts } from '../woo/productWrite';

/** Who answered for a row. One source, named on the row so the console can say so. */
export type CatalogSource = 'woocommerce';

/** One product as the admin lists it, with every unreported fact left unknown. */
export interface AdminCatalogRow {
  /** Which source answered for this row. */
  source: CatalogSource;
  id: string;
  name: string;
  slug: string;
  image: string;
  images: string[];
  categoryName: string | null;
  /** The source's own facet id for the category — see `AdminCatalogFacet`. */
  categoryId: string | null;
  /** Display string, e.g. "$9.95". Empty when the source reported no price. */
  price: string;
  priceMin: number | null;
  priceMax: number | null;
  /** Struck-through "was" price. Null: the store reports no such column. */
  compareAtPrice: number | null;
  /** Null when the source reported no SKU. Never invented. */
  sku: string | null;
  stockStatus: StockStatus;
  /** Unit count. Null when the route reports no count. */
  stockQuantity: number | null;
  lowStockThreshold: number | null;
  trackInventory: boolean | null;
  /** Shipping weight, or null when the read does not report one. */
  weight: number | null;
  weightUnit: string | null;
  /** Listing state, or null when the source has no such concept. */
  isListed: boolean | null;
  /**
   * The store's own listing status.
   *
   * Carried on the row so the editor can read a product's state back as itself.
   * Without it the console treated every non-published state as one value and
   * wrote that back as WooCommerce `private`, so saving a draft unlisted it.
   */
  status: WooListingStatus | null;
  /** Live but withheld from the storefront (the niche rule). */
  isHiddenFromStorefront: boolean | null;
  isFeatured: boolean;
  description?: string | null;
  shortDescription?: string | null;
  /**
   * True when the product falls outside the store's niche (Himalayan pink salt).
   * Such a row stays visible here on purpose — it is the owner who has to archive
   * it in WooCommerce — and the storefront withholds it until they do.
   */
  isOffNiche: boolean;
  /** Catalog fields the source could not supply. */
  missing: string[];
}

/**
 * A filter value the admin can narrow the catalog by.
 *
 * `id` is the source's own handle: a Supabase uuid there, the category name on
 * the WooCommerce source (whose public routes expose names, not our ids). The
 * read model translates it, so the view keeps one dropdown.
 */
export interface AdminCatalogFacet {
  id: string;
  name: string;
}

export type AdminCatalogSort = 'newest' | 'name' | 'price_asc' | 'price_desc';

export interface AdminCatalogQuery {
  search?: string;
  /** A facet id from `AdminCatalogPage.facets`. */
  categoryId?: string;
  isFeatured?: boolean;
  /** Listing-state filter. Ignored, with a warning, by a source without one. */
  listing?: 'active' | 'inactive';
  /** Inventory filter. Ignored, with a warning, when stock is not reported. */
  lowStock?: boolean;
  sort?: AdminCatalogSort;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
}

export interface AdminCatalogPage {
  rows: AdminCatalogRow[];
  count: number;
  totalPages: number;
  /** Category options available on the active source. */
  facets: AdminCatalogFacet[];
  degraded: boolean;
  warnings: string[];
}

/**
 * Product facts for the dashboard, from the one source there is.
 */
export interface AdminCatalogStats {
  source: CatalogSource;
  total: number;
  featured: number;
  priceUnavailable: number;
  skuUnavailable: number;
  stockUnknown: number;
  /** Categories present in this catalog. */
  categories: number;
}

// The page size is owned by a client-safe leaf module so the products screen can
// compute its pager without importing this read model. Re-exported for the
// server callers that already import it from here.
export { ADMIN_CATALOG_PER_PAGE };

/* ------------------------------------------------------------------ */
/* Projections (pure)                                                  */
/* ------------------------------------------------------------------ */

/** WooCommerce / storefront model -> admin row. Everything unknown stays null. */
export function rowFromCatalogProduct(product: CatalogProduct): AdminCatalogRow {
  // The model carries a placeholder where a source reported no category; showing
  // that as a category — or counting it — would invent taxonomy.
  const categoryName =
    product.category && product.category !== UNCATEGORIZED_CATEGORY ? product.category : null;

  return {
    source: 'woocommerce',
    id: String(product.id),
    name: product.name,
    slug: product.slug,
    image: product.image,
    images: product.images ?? [],
    categoryName,
    categoryId: categoryName,
    // This row came from the public read, which returns published products only,
    // so it is live — that is a fact about the read, not an assumption.
    status: 'publish',
    price: product.price,
    priceMin: product.priceMin,
    priceMax: product.priceMax ?? null,
    // The catalog model treats `priceMax` as the top of a variant range, never
    // as a discount, so a WooCommerce row has no compare-at price to show.
    compareAtPrice: null,
    sku: product.sku ?? null,
    stockStatus: product.stockStatus ?? 'unknown',
    // The same count the storefront caps a cart line with, from the same read:
    // one number, so the console and the product page cannot disagree about how
    // many units are left. Null when the route reports no count.
    stockQuantity: product.stockQuantity ?? null,
    lowStockThreshold: null,
    trackInventory: product.stockQuantity == null ? null : true,
    weight: null,
    weightUnit: null,
    // Both public product routes return published products only, so a row that
    // exists here is listed. Every write path is still Supabase-only.
    isListed: true,
    isHiddenFromStorefront: null,
    isFeatured: product.isFeatured === true,
    description: product.description ?? null,
    shortDescription: (product as { shortDescription?: string }).shortDescription ?? product.description ?? null,
    isOffNiche: !isNicheProduct(product),
    missing: product.missing ?? [],
  };
}

/** Woocommerce's stock words → the console's. Unknown stays unknown. */
function consoleStockStatus(status: AdminProductRecord['stockStatus']): StockStatus {
  if (status === 'instock') return 'in_stock';
  if (status === 'outofstock') return 'out_of_stock';
  if (status === 'onbackorder') return 'on_backorder';
  return 'unknown';
}

/**
 * An authenticated WooCommerce admin record → an admin row.
 *
 * Used for the products the public read cannot see — drafts, private/archived
 * and pending — because those are rows the console created and must be able to
 * list, edit and publish. The store's own values are reported as they are; a
 * fact the record does not carry is null rather than a default.
 */
export function rowFromWooAdminProduct(record: AdminProductRecord): AdminCatalogRow {
  const categoryName = record.categoryNames[0] ?? null;
  return {
    source: 'woocommerce',
    id: String(record.id),
    name: record.name,
    slug: record.slug || String(record.id),
    image: record.images[0] ?? '',
    images: record.images,
    categoryName,
    categoryId: categoryName,
    price: record.price === null ? '' : `$${record.price.toFixed(2)}`,
    priceMin: record.price,
    priceMax: null,
    compareAtPrice: record.compareAtPrice,
    sku: record.sku,
    stockStatus: consoleStockStatus(record.stockStatus),
    stockQuantity: record.stockQuantity,
    lowStockThreshold: null,
    trackInventory: record.manageStock,
    weight: record.weight,
    weightUnit: null,
    status: record.status,
    isListed: record.isListed,
    // The withholding that matters for these rows is their listing state, which
    // is stated above; nothing else hides them from a customer.
    isHiddenFromStorefront: record.isListed ? null : true,
    isFeatured: record.isFeatured,
    description: record.description || null,
    shortDescription: record.shortDescription || null,
    // Same guard the storefront applies, so a draft cannot bypass it by being
    // unlisted: the owner still has to fix it before it can go live.
    isOffNiche: !isNicheProduct({
      id: String(record.id),
      sku: record.sku,
      name: record.name,
      category: categoryName ?? '',
      description: record.description ?? '',
    }),
    missing: [],
  };
}

/** Unknown-priced products sort last in both directions — never as zero. */
export function sortAdminCatalogRows(rows: AdminCatalogRow[], sort: AdminCatalogSort = 'newest'): AdminCatalogRow[] {
  const sorted = [...rows];
  switch (sort) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'price_asc':
      return sorted.sort((a, b) => comparePrices(a.priceMin, b.priceMin, 'asc'));
    case 'price_desc':
      return sorted.sort((a, b) => comparePrices(a.priceMin, b.priceMin, 'desc'));
    default:
      return sorted.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }
}

function comparePrices(a: number | null, b: number | null, direction: 'asc' | 'desc'): number {
  const aKnown = typeof a === 'number' && Number.isFinite(a);
  const bKnown = typeof b === 'number' && Number.isFinite(b);
  if (!aKnown && !bKnown) return 0;
  if (!aKnown) return 1;
  if (!bKnown) return -1;
  return direction === 'asc' ? a - b : b - a;
}

/** Counts the WooCommerce source can honestly report. */
export function statsFromRows(rows: AdminCatalogRow[]): AdminCatalogStats {
  return {
    source: 'woocommerce',
    total: rows.length,
    featured: rows.filter((row) => row.isFeatured).length,
    priceUnavailable: rows.filter((row) => row.missing.includes('price')).length,
    skuUnavailable: rows.filter((row) => row.missing.includes('sku')).length,
    stockUnknown: rows.filter((row) => row.stockStatus === 'unknown').length,
    categories: facetsFromRows(rows).length,
  };
}

function facetsFromRows(rows: AdminCatalogRow[]): AdminCatalogFacet[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.categoryName) names.add(row.categoryName);
  }
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ id: name, name }));
}

/* ------------------------------------------------------------------ */
/* The store source                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every product the store holds that is not published.
 *
 * The public read is what the storefront uses, and it returns published products
 * only — so a draft the owner had just created through the console was invisible
 * in the very list that created it (measured on staging: a new draft left the
 * product count at 10). This is the authenticated admin read, the only
 * WooCommerce read that reports drafts, private/archived and pending rows.
 *
 * A failure here degrades the page with a stated reason rather than hiding it:
 * the published catalog is still listed, and the warning says what is missing.
 */
async function readUnlistedProducts(): Promise<{ rows: AdminCatalogRow[]; error: string | null }> {
  try {
    const products = await listWooProducts({ status: 'any', perPage: WORDPRESS_MAX_PER_PAGE });
    return {
      rows: products
        .map(fromWooProduct)
        .filter((record) => !isPublicWooStatus(record.status))
        .map(rowFromWooAdminProduct),
      error: null,
    };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : 'the store did not answer',
    };
  }
}

async function wooPage(query: AdminCatalogQuery): Promise<AdminCatalogPage> {
  // The unscoped read: the console shows the source's whole catalog, including
  // the products the storefront withholds, and says how many that is below.
  const [read, unlisted] = await Promise.all([
    readCatalogProducts({
      search: query.search || undefined,
      isFeatured: query.isFeatured,
      perPage: WORDPRESS_MAX_PER_PAGE,
      signal: query.signal,
    }),
    readUnlistedProducts(),
  ]);

  const warnings = [...read.warnings];
  if (unlisted.error) {
    warnings.push(
      `Drafts and archived products could not be read (${unlisted.error}), so only published products are listed.`
    );
  }
  const offNiche = countOffNicheProducts(read.products);
  if (offNiche > 0) {
    warnings.push(
      `${offNiche} product${offNiche === 1 ? ' is' : 's are'} outside the Himalayan pink salt niche and ${offNiche === 1 ? 'is' : 'are'} withheld from the storefront. Archive them in WooCommerce to clear this — see docs/HIMALAYAN-PINK-SALT-NICHE-AUDIT.md.`
    );
  }

  const allRows = [...read.products.map(rowFromCatalogProduct), ...unlisted.rows];
  if (allRows.length >= WORDPRESS_MAX_PER_PAGE) {
    warnings.push(
      `Only the first ${WORDPRESS_MAX_PER_PAGE} products were read: WordPress returns no more than that in one request, so this list may be incomplete.`
    );
  }
  if (query.lowStock) {
    warnings.push(
      'The low-stock filter does not apply: WooCommerce inventory counts are not available on the public product routes.'
    );
  }

  // Facets come from the unfiltered read so narrowing by category cannot empty
  // the dropdown you narrowed with.
  const facets = facetsFromRows(allRows);
  const byCategory = query.categoryId
    ? allRows.filter((row) => row.categoryId === query.categoryId)
    : allRows;
  // The listing filter applies now that every row carries the store's own
  // status: Active is published, Inactive is everything the store withholds.
  const rows = query.listing
    ? byCategory.filter((row) => (query.listing === 'active' ? row.isListed === true : row.isListed !== true))
    : byCategory;

  const sorted = sortAdminCatalogRows(rows, query.sort);
  const perPage = query.perPage ?? ADMIN_CATALOG_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const page = Math.min(Math.max(1, query.page ?? 1), totalPages);

  return {
    rows: sorted.slice((page - 1) * perPage, page * perPage),
    count: sorted.length,
    totalPages,
    facets,
    degraded: read.degraded || warnings.length > 0,
    warnings,
  };
}

async function wooStats(): Promise<AdminCatalogStats> {
  // Stats describe the source's catalog, not the storefront's slice of it: a
  // dashboard that quietly dropped off-niche rows would report a product count
  // the owner cannot reconcile against WooCommerce. Unlisted rows are counted
  // for the same reason — WooCommerce's own product count includes them.
  const [read, unlisted] = await Promise.all([
    readCatalogProducts({ perPage: WORDPRESS_MAX_PER_PAGE }),
    readUnlistedProducts(),
  ]);
  return statsFromRows([...read.products.map(rowFromCatalogProduct), ...unlisted.rows]);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Reads a page of the admin catalog from the store. */
export async function readAdminCatalogPage(query: AdminCatalogQuery = {}): Promise<AdminCatalogPage> {
  return wooPage(query);
}

/** Reads the product facts the dashboard shows, from the same source. */
export async function readAdminCatalogStats(): Promise<AdminCatalogStats> {
  return wooStats();
}
