/**
 * Admin catalog read model.
 *
 * The admin panel and the storefront must never disagree about which products
 * exist. They did: the storefront read WooCommerce staging (11 products) while
 * `/admin` read the old Supabase rows (7), so the catalog had two owners. This
 * module removes that split by answering admin reads from the same seam the
 * storefront uses.
 *
 * It owns no queries of its own:
 *   - `supabase`    delegates to `adminApi` (the Supabase admin query layer,
 *                   unchanged, including its inactive-product visibility),
 *                   and projects the rows into the shape below.
 *   - `woocommerce` delegates to the catalog adapter (`getCatalogProducts`),
 *                   which is the read the storefront performs.
 *
 * ## Unknown is a value
 * Every field a source cannot report is `null` — price, SKU, stock, listing
 * state, inventory counts — and the UI renders that as unknown. Nothing is
 * defaulted to zero, because `0` is a price and a stock level, not a silence.
 * For the same reason the stats are a union: a source that cannot count low
 * stock reports no low-stock figure rather than another source's number.
 */

import type { Product as CatalogProduct, StockStatus } from '../../data/products';
import type { Category, Inventory, Product as SupabaseProduct } from '../supabase/database.types';
import { ADMIN_CATALOG_PER_PAGE } from '../admin/catalogPageSize';
import { adminApi } from '../supabase/api/admin';
import { isRealCatalogProduct } from '../catalog/realProduct';
import { isSupabaseConfigured } from '../supabase/client';
import { priceDisplayFromRange } from '../products/price';
import { countOffNicheProducts, isNicheProduct } from '../catalog/niche';
import { isWooCommerceDataSource, type DataSource } from './config';
import { readCatalogProducts } from './products';
import { WORDPRESS_MAX_PER_PAGE } from './wordpress';
import { UNCATEGORIZED_CATEGORY } from './woocommerce';

/** The row shape the Supabase editor saves back. Absent on every other source. */
export type AdminEditableRecord = SupabaseProduct & {
  category: Category | null;
  inventory: Inventory | null;
};

/** One product as the admin lists it, with every unreported fact left unknown. */
export interface AdminCatalogRow {
  /** Which source answered for this row. */
  source: DataSource;
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
  /** Struck-through "was" price. Null on sources with no such column. */
  compareAtPrice: number | null;
  /** Null when the source reported no SKU. Never invented. */
  sku: string | null;
  stockStatus: StockStatus;
  /** Unit count. Null on any source that does not report one. */
  stockQuantity: number | null;
  lowStockThreshold: number | null;
  trackInventory: boolean | null;
  /** Shipping weight, or null when the source has no such column. */
  weight: number | null;
  weightUnit: string | null;
  /** Listing state, or null when the source has no such concept. */
  isListed: boolean | null;
  /** Live but withheld from the storefront (the Supabase packing-profile rule). */
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
  /** Present only when this row can be saved back through the admin editor. */
  record: AdminEditableRecord | null;
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
 * Product facts for the dashboard.
 *
 * Deliberately a union: the WooCommerce source reports no listing state and no
 * inventory counts, so it has no active/inactive/low-stock figures to show. A
 * merged type with optional fields would invite the view to fall back to
 * another source's numbers, which is how the two catalogs drifted apart.
 */
export type AdminCatalogStats =
  | {
      source: 'supabase';
      total: number;
      active: number;
      inactive: number;
      featured: number;
      lowStock: number;
      outOfStock: number;
      /** Categories present in this catalog. */
      categories: number;
    }
  | {
      source: 'woocommerce';
      total: number;
      featured: number;
      priceUnavailable: number;
      skuUnavailable: number;
      stockUnknown: number;
      /** Categories present in this catalog. */
      categories: number;
    };

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
    record: null,
  };
}

/** Supabase admin row -> admin row. Carries the record the editor saves back. */
export function rowFromSupabaseProduct(record: AdminEditableRecord): AdminCatalogRow {
  const inventory = record.inventory;
  return {
    source: 'supabase',
    id: String(record.id),
    name: record.name,
    slug: record.slug,
    image: record.thumbnail || (record.images ?? [])[0] || '',
    images: Array.isArray(record.images) ? record.images.filter(Boolean) : [],
    categoryName: record.category?.name ?? null,
    categoryId: record.category_id ?? null,
    price: priceDisplayFromRange(record.price ?? null),
    priceMin: record.price ?? null,
    priceMax: record.compare_at_price ?? null,
    compareAtPrice: record.compare_at_price ?? null,
    sku: record.sku || null,
    // Supabase tracks units, not a stock status; the rule lives directly above.
    stockStatus: stockStatusFromInventory(record),
    stockQuantity: inventory ? inventory.quantity : null,
    lowStockThreshold: inventory ? inventory.low_stock_threshold : null,
    trackInventory: inventory ? inventory.track_inventory : null,
    weight: record.weight ?? null,
    weightUnit: record.weight_unit ?? null,
    isListed: Boolean(record.is_active),
    isHiddenFromStorefront: isWithheldFromStorefront(record),
    isFeatured: Boolean(record.is_featured),
    description: record.description ?? null,
    shortDescription: record.short_description ?? null,
    isOffNiche: !isNicheProduct({
      name: record.name,
      category: record.category?.name ?? null,
    }),
    missing: [],
    record,
  };
}

/**
 * Stock status the Supabase inventory row implies.
 *
 * Only a tracked count answers the question. A missing inventory row and a row
 * with tracking switched off both leave stock unknown — neither is a zero, and
 * listing state (`is_active`) says nothing about stock at all.
 */
function stockStatusFromInventory(record: AdminEditableRecord): StockStatus {
  const inventory = record.inventory;
  if (!inventory || inventory.track_inventory === false) return 'unknown';
  return inventory.quantity <= 0 ? 'out_of_stock' : 'in_stock';
}

/**
 * Active, but still withheld from the storefront. The packing-profile rule has
 * exactly one owner (`isRealCatalogProduct`, the gate the storefront itself
 * applies); asking it here keeps the two from drifting. A Supabase-only policy,
 * so this is null on every other source.
 */
function isWithheldFromStorefront(record: AdminEditableRecord): boolean {
  return Boolean(record.is_active) && !isRealCatalogProduct(record);
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
/* Supabase source                                                     */
/* ------------------------------------------------------------------ */

function supabaseSort(sort: AdminCatalogSort = 'newest'): {
  sortBy: 'name' | 'price' | 'created_at';
  sortOrder: 'asc' | 'desc';
} {
  switch (sort) {
    case 'name':
      return { sortBy: 'name', sortOrder: 'asc' };
    case 'price_asc':
      return { sortBy: 'price', sortOrder: 'asc' };
    case 'price_desc':
      return { sortBy: 'price', sortOrder: 'desc' };
    default:
      return { sortBy: 'created_at', sortOrder: 'desc' };
  }
}

async function supabasePage(query: AdminCatalogQuery): Promise<AdminCatalogPage> {
  // No configured source means no catalog. The admin used to substitute the
  // bundled demo products here; that is a fabricated catalog, so it is gone.
  if (!isSupabaseConfigured()) {
    return {
      rows: [],
      count: 0,
      totalPages: 1,
      facets: [],
      degraded: true,
      warnings: [
        'The Supabase source is not configured, so there is no catalog to read. Set the Supabase environment variables, or point NEXT_PUBLIC_DATA_SOURCE at WooCommerce.',
      ],
    };
  }

  const { sortBy, sortOrder } = supabaseSort(query.sort);
  const [page, categories] = await Promise.all([
    adminApi.getProducts({
      search: query.search || undefined,
      category_id: query.categoryId || undefined,
      is_active: query.listing === 'active' ? true : query.listing === 'inactive' ? false : undefined,
      is_featured: query.isFeatured,
      low_stock: query.lowStock,
      sortBy,
      sortOrder,
      page: query.page,
      limit: query.perPage ?? ADMIN_CATALOG_PER_PAGE,
    }),
    adminApi.getCategories(),
  ]);

  return {
    rows: page.products.map(rowFromSupabaseProduct),
    count: page.count,
    totalPages: Math.max(1, page.totalPages || 1),
    facets: categories.map((category) => ({ id: category.id, name: category.name })),
    degraded: false,
    warnings: [],
  };
}

/* ------------------------------------------------------------------ */
/* WooCommerce source                                                  */
/* ------------------------------------------------------------------ */

async function wooPage(query: AdminCatalogQuery): Promise<AdminCatalogPage> {
  // The unscoped read: the console shows the source's whole catalog, including
  // the products the storefront withholds, and says how many that is below.
  const read = await readCatalogProducts({
    search: query.search || undefined,
    isFeatured: query.isFeatured,
    perPage: WORDPRESS_MAX_PER_PAGE,
    signal: query.signal,
  });

  const warnings = [...read.warnings];
  const offNiche = countOffNicheProducts(read.products);
  if (offNiche > 0) {
    warnings.push(
      `${offNiche} product${offNiche === 1 ? ' is' : 's are'} outside the Himalayan pink salt niche and ${offNiche === 1 ? 'is' : 'are'} withheld from the storefront. Archive them in WooCommerce to clear this — see docs/HIMALAYAN-PINK-SALT-NICHE-AUDIT.md.`
    );
  }
  if (read.products.length >= WORDPRESS_MAX_PER_PAGE) {
    warnings.push(
      `Only the first ${WORDPRESS_MAX_PER_PAGE} products were read: WordPress returns no more than that in one request, so this list may be incomplete.`
    );
  }
  if (query.listing) {
    warnings.push(
      'The Active/Inactive filter does not apply: every product a public WooCommerce route returns is published.'
    );
  }
  if (query.lowStock) {
    warnings.push(
      'The low-stock filter does not apply: WooCommerce inventory counts are not available on the public product routes.'
    );
  }

  const allRows = read.products.map(rowFromCatalogProduct);
  // Facets come from the unfiltered read so narrowing by category cannot empty
  // the dropdown you narrowed with.
  const facets = facetsFromRows(allRows);
  const rows = query.categoryId
    ? allRows.filter((row) => row.categoryId === query.categoryId)
    : allRows;

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
  // the owner cannot reconcile against WooCommerce.
  const read = await readCatalogProducts({ perPage: WORDPRESS_MAX_PER_PAGE });
  return statsFromRows(read.products.map(rowFromCatalogProduct));
}

async function supabaseStats(): Promise<AdminCatalogStats> {
  if (!isSupabaseConfigured()) {
    return { source: 'supabase', total: 0, active: 0, inactive: 0, featured: 0, lowStock: 0, outOfStock: 0, categories: 0 };
  }
  const [stats, categories] = await Promise.all([
    adminApi.getProductManagementStats(),
    adminApi.getCategories(),
  ]);
  return {
    source: 'supabase',
    total: stats.total,
    active: stats.active,
    inactive: stats.inactive,
    featured: stats.featured,
    lowStock: stats.lowStock,
    outOfStock: stats.outOfStock,
    categories: categories.length,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Reads a page of the admin catalog through the configured source. */
export async function readAdminCatalogPage(query: AdminCatalogQuery = {}): Promise<AdminCatalogPage> {
  return isWooCommerceDataSource() ? wooPage(query) : supabasePage(query);
}

/** Reads the product facts the dashboard shows, from the same source. */
export async function readAdminCatalogStats(): Promise<AdminCatalogStats> {
  return isWooCommerceDataSource() ? wooStats() : supabaseStats();
}
