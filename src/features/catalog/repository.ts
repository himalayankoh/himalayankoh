// ============================================================================
// LUXEDGE V2 — CATALOG REPOSITORY (Catalog Launch Phase)
//
// Persistence for the admin Product Manager + Promotions on top of the
// existing db adapter (src/services/db.ts). Writes flow through the signed-in
// ADMIN JWT (setDbToken) so RLS governs every mutation; the service-role key
// never reaches this module or the browser bundle.
//
// Schema: supabase/migrations/0010_catalog_management.sql (products catalog
// columns, product_images.variant_id, coupons, store_offers, store_settings).
//
// No credentials, no fake facts: null/unknown stays null/unknown.
// ============================================================================

import { getDb, type DbAdapter } from '../../services/db';
import { getFreshAccessToken } from '../../services/wordpressAdminAuth';
import { singleFlight } from '../../lib/admin/singleFlight';
import {
  CatalogProduct, CatalogCategory, CatalogImage, CatalogVariant, Coupon,
  StoreOffer, StoreSettings, DEFAULT_STORE_SETTINGS, deriveMarginPercent,
  deriveStockStatus, CatalogStatus,
} from './types';
import {
  deriveCommerceReadiness, deriveInventorySource, deriveSourceType,
  type CommerceReadiness, type SourceType, type InventorySource,
} from './commerceReadiness';
import { parseTagList } from './tags';

// ---------------------------------------------------------------------------
// Live-schema awareness
//
// The Catalog Launch code targets supabase/migrations/0010_catalog_management.sql.
// Until the owner applies 0010 in the SQL editor, the LIVE `products` table
// has only legacy columns and `coupons` / `store_offers` / `store_settings`
// do not exist yet. We probe the live schema once (public OpenAPI metadata,
// no secrets) so writes degrade gracefully: pre-0010 the admin edits legacy
// fields only; after 0010 the full product manager works. Probes that fail
// are treated as "assume full schema" (never block a working post-0010 env).
// ---------------------------------------------------------------------------
const cachedTableCols = new Map<string, Set<string> | null>();

/**
 * Probe whether specific columns exist using PostgREST's select= validation,
 * which works with the browser anon key + signed-in JWT — unlike the OpenAPI
 * endpoint, which 401s for non-secret keys. Returns the subset of candidates
 * that exist, or null when the table itself is unreachable.
 */
async function probeColumnsBySelect(table: string, candidates: string[]): Promise<Set<string> | null> {
  const d = getDb() as DbAdapter & { mode?: string };
  if (d.mode !== 'supabase') return null;
  const url = (d as unknown as { url?: string }).url || '';
  const h = (d as unknown as { headers?: (m: string) => Record<string, string> }).headers;
  if (!url || !h) return null;
  const u = new URL(`${url.replace(/\/$/, '')}/rest/v1/${table}`);
  u.searchParams.set('limit', '1');
  const existing = new Set<string>();
  let remaining = [...candidates];
  // On 400, PostgREST names the FIRST missing column; drop it and retry until
  // the select succeeds (all remaining exist) or no candidates are left.
  // Two error shapes occur across PostgREST versions: PGRST204
  // ("Could not find the 'X' column") and 42703 ("column table.X does not exist").
  // Retry once on transient failure: a single dropped probe makes image/variant
  // inserts omit required legacy columns (e.g. product_images.storage_path is
  // NOT NULL) and every subsequent Save in the session fails silently.
  for (let attempt = 0; attempt < 2; attempt++) {
    let failed = false;
    for (let i = 0; i <= candidates.length && remaining.length; i++) {
      u.searchParams.set('select', remaining.join(','));
      let res: Response | null = null;
      try {
        res = await fetch(u.toString(), { headers: h.call(d, 'GET') });
      } catch {
        failed = true;
        break;
      }
      if (res.ok) {
        remaining.forEach((c) => existing.add(c));
        break;
      }
      const text = await res.text().catch(() => '');
      const m = text.match(/Could not find the '([^']+)' column/) || text.match(new RegExp(`column ${table}\.([^ ]+) does not exist`));
      if (!m) {
        failed = true;
        break;
      }
      remaining = remaining.filter((c) => c !== m[1]);
    }
    if (!failed) return existing.size ? existing : null;
    // Transient network/parse failure — retry the whole probe once before
    // giving up (see comment above for why this matters).
  }
  return existing.size ? existing : null;
}

// Candidate columns per table: the exact columns this module may write,
// probed together in one select= request (see probeColumnsBySelect).
const PRODUCT_PROBE_COLUMNS: readonly string[] = [
  'name', 'title', 'short_title', 'subtitle', 'short_description', 'description',
  'features', 'specifications', 'category_id', 'brand', 'status', 'price',
  'compare_at_price', 'cost_price', 'landed_cost', 'currency', 'sku',
  'inventory_qty', 'stock_status', 'low_stock_threshold', 'shipping_cost',
  'free_shipping', 'delivery_min_days', 'delivery_max_days', 'shipping_note',
  'us_inventory', 'supplier_source', 'supplier_product_ref', 'safety_class',
  'safety_review_status', 'intended_species', 'commerce_readiness', 'source_type',
  'inventory_source', 'fulfillment_method', 'supplier_url', 'supplier_stock_status',
  'risk_flags', 'tags', 'featured', 'new_arrival', 'trending', 'best_rated',
  'best_seller', 'promoted', 'sale_enabled', 'discount_type', 'discount_value',
  'seo_title', 'seo_description', 'seo_keywords', 'canonical_slug', 'og_image',
  'owner_notes', 'evidence_notes', 'sort_order', 'listing_ends_at',
];
const IMAGE_PROBE_COLUMNS: readonly string[] = ['storage_path', 'public_url', 'created_at'];
const VARIANT_PROBE_COLUMNS: readonly string[] = ['title', 'price_amount', 'option_values', 'created_at', 'updated_at'];

async function liveTableColumns(table: string, candidates: readonly string[]): Promise<Set<string> | null> {
  if (cachedTableCols.has(table)) return cachedTableCols.get(table) ?? null;
  const cols = await probeColumnsBySelect(table, [...candidates]);
  cachedTableCols.set(table, cols);
  return cols;
}

async function liveProductColumns(): Promise<Set<string> | null> {
  return liveTableColumns('products', PRODUCT_PROBE_COLUMNS);
}

/** Columns this environment can actually write; null = assume full schema. */
async function writableColumns(full: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cols = await liveProductColumns();
  if (!cols) return full;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(full)) if (cols.has(k)) out[k] = v;
  return out;
}

/**
 * Pre-0010 the live products_status_check does NOT allow 'active'/'inactive'/
 * 'ready' — only 'draft' and the pipeline statuses. Post-0010 all catalog
 * statuses are allowed. Returns the effective status for this environment.
 */
const CATALOG_STATUSES: readonly CatalogStatus[] = ['draft', 'ready', 'active', 'inactive', 'archived'];

async function effectiveStatus(status: CatalogStatus): Promise<CatalogStatus> {
  if (!CATALOG_STATUSES.includes(status)) {
    // Unknown statuses are fail-closed to DRAFT — never silently stored.
    return 'draft';
  }
  const cols = await liveProductColumns();
  if (cols && !cols.has('featured') && ['active', 'inactive', 'ready'].includes(status)) {
    // Pre-0010: never silently publish to 'published' (AUTO PUBLISH = OFF).
    // Keep the row safely in draft; the owner activates after applying 0010.
    return 'draft';
  }
  return status;
}

/** Test-only hook: forget the probed live schema (restores re-probing). */
export function __resetCatalogSchemaCacheForTests(): void {
  cachedTableCols.clear();
}

export function uid(): string {
  try {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function isWooId(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Point the shared db adapter at the signed-in user's JWT (admin). */
export function setDbToken(token: string | null): void {
  const d = getDb() as DbAdapter & { setAccessToken?: (t: string | null) => void };
  if (typeof d.setAccessToken === 'function') d.setAccessToken(token);
}

// ---------------------------------------------------------------------------
// Row shapes (Supabase snake_case columns)
// ---------------------------------------------------------------------------
interface ProductRow {
  id: string;
  slug: string;
  name: string;
  /** Legacy live column (NOT NULL) — V2 reads `name`, but the row carries both. */
  title?: string | null;
  short_title?: string | null;
  subtitle?: string | null;
  short_description?: string | null;
  description?: string | null;
  long_description?: string | null;
  features?: unknown;
  specifications?: unknown;
  category_id?: string | null;
  brand?: string | null;
  status: string;
  safety_class?: string | null;
  safety_review_status?: string | null;
  intended_species?: string | null;
  price?: number | null;
  compare_at_price?: number | null;
  cost_price?: number | null;
  landed_cost?: number | null;
  gross_margin?: number | null;
  currency?: string | null;
  sku?: string | null;
  inventory_qty?: number | null;
  stock_status?: string | null;
  low_stock_threshold?: number | null;
  shipping_cost?: number | null;
  free_shipping?: boolean | null;
  delivery_min_days?: number | null;
  delivery_max_days?: number | null;
  shipping_note?: string | null;
  us_inventory?: boolean | null;
  supplier_source?: string | null;
  supplier_product_ref?: string | null;
  // Migration 0016 — commerce readiness model
  commerce_readiness?: string | null;
  source_type?: string | null;
  inventory_source?: string | null;
  fulfillment_method?: string | null;
  supplier_url?: string | null;
  supplier_stock_status?: string | null;
  risk_flags?: unknown;
  tags?: unknown;
  featured?: boolean | null;
  new_arrival?: boolean | null;
  trending?: boolean | null;
  best_rated?: boolean | null;
  best_seller?: boolean | null;
  promoted?: boolean | null;
  sale_enabled?: boolean | null;
  discount_type?: string | null;
  discount_value?: number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: unknown;
  canonical_slug?: string | null;
  og_image?: string | null;
  owner_notes?: string | null;
  evidence_notes?: string | null;
  sort_order?: number | null;
  listing_ends_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [k: string]: unknown;
}

interface ImageRow {
  id: string;
  product_id: string;
  url: string;
  alt_text?: string | null;
  kind?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
  variant_id?: string | null;
  [k: string]: unknown;
}

interface VariantRow {
  id: string;
  product_id: string;
  attributes?: unknown;
  sku?: string | null;
  price?: number | null;
  compare_at_price?: number | null;
  cost_price?: number | null;
  inventory_qty?: number | null;
  status?: string | null;
  low_stock_threshold?: number | null;
  [k: string]: unknown;
}

interface CategoryRow {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  [k: string]: unknown;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function strMap(v: unknown): Record<string, string> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string') out[k] = val;
    }
    return out;
  }
  return {};
}
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function rowToProduct(row: ProductRow, categories: CategoryRow[], images: ImageRow[], variants: VariantRow[]): CatalogProduct {
  const cat = categories.find((c) => c.id === row.category_id);
  const price = num(row.price);
  const compare = num(row.compare_at_price);
  const cost = num(row.cost_price);
  const landed = num(row.landed_cost);
  const myImages = images
    .filter((i) => i.product_id === row.id)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order) || (a.is_primary ? -1 : 1) - (b.is_primary ? -1 : 1))
    .map((i): CatalogImage => ({
      id: i.id,
      productId: i.product_id,
      url: i.url,
      altText: i.alt_text || '',
      kind: (i.kind as CatalogImage['kind']) || 'product',
      isPrimary: !!i.is_primary,
      sortOrder: num(i.sort_order),
      variantId: i.variant_id || null,
    }));
  const myVariants = variants
    .filter((v) => v.product_id === row.id)
    .map((v): CatalogVariant => {
      const image = myImages.find((im) => im.variantId === v.id);
      return {
        id: v.id,
        productId: v.product_id,
        attributes: strMap(v.attributes),
        sku: v.sku || '',
        price: v.price != null ? num(v.price) : null,
        compareAtPrice: v.compare_at_price != null ? num(v.compare_at_price) : null,
        costPrice: v.cost_price != null ? num(v.cost_price) : null,
        inventoryQty: num(v.inventory_qty),
        status: v.status || 'active',
        lowStockThreshold: num(v.low_stock_threshold),
        image: image?.url || null,
      };
    });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name || row.title || '',
    shortTitle: row.short_title || undefined,
    subtitle: row.subtitle || undefined,
    shortDescription: row.short_description || row.long_description ? (row.short_description || '') : '',
    description: row.description || row.long_description || '',
    features: strArr(row.features),
    specifications: asRecord(row.specifications),
    categoryId: row.category_id || null,
    categoryName: cat?.name || '',
    brand: row.brand || 'Himalayan Koh',
    status: (['draft', 'ready', 'active', 'inactive', 'archived', 'safety_hold'].includes(row.status) ? row.status : row.status === 'published' ? 'active' : 'draft') as CatalogStatus,
    price,
    compareAtPrice: compare > price ? compare : 0,
    costPrice: cost,
    landedCost: landed,
    marginPercent: deriveMarginPercent(price, landed > 0 ? landed : cost),
    currency: row.currency || 'USD',
    sku: row.sku || '',
    inventoryQty: num(row.inventory_qty),
    stockStatus: deriveStockStatus(num(row.inventory_qty), num(row.low_stock_threshold), (row.stock_status as CatalogProduct['stockStatus']) || 'unknown'),
    lowStockThreshold: num(row.low_stock_threshold),
    shippingCost: num(row.shipping_cost),
    freeShipping: !!row.free_shipping,
    deliveryMinDays: row.delivery_min_days != null ? num(row.delivery_min_days) : null,
    deliveryMaxDays: row.delivery_max_days != null ? num(row.delivery_max_days) : null,
    shippingNote: row.shipping_note || undefined,
    usInventory: !!row.us_inventory,
    supplierSource: row.supplier_source || undefined,
    supplierProductRef: row.supplier_product_ref || undefined,
    safetyClass: (row.safety_class as CatalogProduct['safetyClass']) || null,
    safetyReviewStatus: (row.safety_review_status as CatalogProduct['safetyReviewStatus']) || null,
    intendedSpecies: row.intended_species || null,
    // Prefer the persisted 0016 classification; derive honestly when absent
    // (pre-migration the column does not exist yet).
    commerceReadiness: (row.commerce_readiness as CatalogProduct['commerceReadiness']) || deriveCommerceReadiness({
      status: row.status,
      supplierSource: row.supplier_source,
      supplierProductRef: row.supplier_product_ref,
      supplierUrl: row.supplier_url,
      costPrice: cost,
      landedCost: landed,
      shippingCost: num(row.shipping_cost),
      freeShipping: !!row.free_shipping,
      deliveryMinDays: row.delivery_min_days != null ? num(row.delivery_min_days) : null,
      deliveryMaxDays: row.delivery_max_days != null ? num(row.delivery_max_days) : null,
      usInventory: !!row.us_inventory,
      stockStatus: row.stock_status || null,
      inventoryQty: num(row.inventory_qty),
      riskFlags: Array.isArray(row.risk_flags) ? (row.risk_flags as string[]) : [],
    }) as CommerceReadiness,
    sourceType: (row.source_type as CatalogProduct['sourceType']) || deriveSourceType({
      supplierSource: row.supplier_source,
      supplierProductRef: row.supplier_product_ref,
      supplierUrl: row.supplier_url,
    }) as SourceType,
    inventorySource: (row.inventory_source as CatalogProduct['inventorySource']) || deriveInventorySource({
      usInventory: !!row.us_inventory,
      stockStatus: row.stock_status || null,
    }) as InventorySource,
    fulfillmentMethod: row.fulfillment_method || null,
    supplierUrl: row.supplier_url || null,
    supplierStockStatus: row.supplier_stock_status || null,
    riskFlags: Array.isArray(row.risk_flags) ? row.risk_flags.filter((x): x is string => typeof x === 'string') : [],
    tags: parseTagList(row.tags),
    featured: !!row.featured,
    newArrival: !!row.new_arrival,
    trending: !!row.trending,
    bestRated: !!row.best_rated,
    bestSeller: !!row.best_seller,
    promoted: !!row.promoted,
    saleEnabled: !!row.sale_enabled,
    discountType: (row.discount_type as CatalogProduct['discountType']) || undefined,
    discountValue: row.discount_value != null ? num(row.discount_value) : undefined,
    seoTitle: row.seo_title || row.name,
    seoDescription: row.seo_description || row.short_description || '',
    // Raw column truth — used by Auto-SEO eligibility. The display fallbacks
    // above (name/short_description) must NEVER drive "does this product have
    // SEO" decisions, or everything looks optimized.
    seoTitleStored: row.seo_title?.trim() ? row.seo_title : null,
    seoDescriptionStored: row.seo_description?.trim() ? row.seo_description : null,
    seoKeywords: parseTagList(row.seo_keywords),
    canonicalSlug: row.canonical_slug || undefined,
    ogImage: row.og_image || undefined,
    images: myImages,
    variants: myVariants,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || row.created_at || '',
    publishedAt: row.published_at || null,
    listingEndsAt: row.listing_ends_at || null,
    ownerNotes: row.owner_notes || undefined,
    evidenceNotes: row.evidence_notes || undefined,
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function listCategories(): Promise<CatalogCategory[]> {
  if (typeof window !== 'undefined') {
    try {
      const prods = await listProducts();
      if (prods.length > 0) {
        const seen = new Map<string, string>();
        for (const p of prods) {
          if (p.categoryName && !seen.has(p.categoryName)) {
            const catId = p.categoryId || `cat-${p.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            seen.set(p.categoryName, catId);
          }
        }
        if (seen.size > 0) {
          let order = 1;
          return Array.from(seen.entries()).map(([name, id]) => ({
            id,
            name,
            slug: id.replace(/^cat-/, ''),
            isActive: true,
            sortOrder: order++,
          }));
        }
      }
    } catch {
      // fallback
    }
  }

  const db = getDb();
  const rows = (await db.list<CategoryRow>('categories', { orderBy: 'sort_order' })) || [];
  if (rows && rows.length > 0) {
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug || r.id,
      description: r.description || undefined,
      isActive: r.is_active !== false,
      sortOrder: num(r.sort_order),
    }));
  }
  return [
    { id: 'cat-bulk-and-rock-salt', name: 'Bulk and Rock Salt', slug: 'bulk-and-rock-salt', isActive: true, sortOrder: 1 },
    { id: 'cat-granular-salt-pouches', name: 'Granular Salt Pouches', slug: 'granular-salt-pouches', isActive: true, sortOrder: 2 },
    { id: 'cat-salt-licks', name: 'Salt Licks', slug: 'salt-licks', isActive: true, sortOrder: 3 },
    { id: 'cat-salt-blocks', name: 'Salt Blocks', slug: 'salt-blocks', isActive: true, sortOrder: 4 },
    { id: 'cat-edible-pink-salt', name: 'Edible Pink Salt', slug: 'edible-pink-salt', isActive: true, sortOrder: 5 },
  ];
}

/** Persist a new category to Supabase so it appears in the Add Product dropdown. */
export async function createCategory(input: { name: string; isActive?: boolean }): Promise<CatalogCategory> {
  const db = getDb();
  const id = uid();
  const slug = `${id.slice(0, 8)}`;
  const now = new Date().toISOString();
  const row = await db.insert<{ id: string } & Record<string, unknown>>('categories', {
    id,
    slug,
    name: input.name.trim(),
    is_active: input.isActive !== false,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  });
  return {
    id: row.id,
    name: input.name.trim(),
    slug,
    isActive: input.isActive !== false,
    sortOrder: 0,
  };
}

/** Rename / toggle a category. */
export async function updateCategory(id: string, patch: { name?: string; isActive?: boolean }): Promise<CatalogCategory | null> {
  const db = getDb();
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
  dbPatch.updated_at = new Date().toISOString();
  const row = await db.update<{ id: string } & Record<string, unknown>>('categories', id, dbPatch);
  if (!row) return null;
  const rn = typeof row.name === 'string' ? row.name : row.id;
  const rsl = typeof row.slug === 'string' ? row.slug : row.id;
  const rd = typeof row.description === 'string' ? row.description : undefined;
  return {
    id: row.id,
    name: patch.name !== undefined ? patch.name.trim() : rn,
    slug: rsl,
    description: rd,
    isActive: patch.isActive !== undefined ? patch.isActive : row.is_active !== false,
    sortOrder: num(row.sort_order),
  };
}

/** Hard-delete a category row (admin action). */
export async function deleteCategory(id: string): Promise<void> {
  const db = getDb();
  await db.remove('categories', id);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
async function loadRefs() {
  const db = getDb();
  const [cats, imgs, vars] = await Promise.all([
    db.list<CategoryRow>('categories'),
    // Skip inline base64 blob rows (test/junk data, ~9 MB in the live DB) —
    // real HTTP image URLs only, so admin/product loads stay fast.
    db.list<ImageRow>('product_images', { limit: 2000, rawFilters: { url: 'not.like.data:*' } }),
    db.list<VariantRow>('product_variants', { limit: 2000 }),
  ]);
  return {
    cats: Array.isArray(cats) ? cats : [],
    imgs: Array.isArray(imgs) ? imgs : [],
    vars: Array.isArray(vars) ? vars : [],
  };
}

function adminCatalogRowToProduct(r: Record<string, unknown>): CatalogProduct {
  const priceNum = typeof r.priceMin === 'number'
    ? r.priceMin
    : parseFloat(String(r.price || '').replace(/[^0-9.]/g, '')) || 0;
  const compareAt = typeof r.compareAtPrice === 'number' ? r.compareAtPrice : 0;
  const rawImgs = (Array.isArray(r.images) && r.images.length > 0
    ? (r.images as string[])
    : (r.image ? [String(r.image)] : [])
  ).map((s) => String(s || '').trim()).filter(Boolean);
  const name = String(r.name || 'Untitled Product');
  const id = String(r.id);
  const slug = String(r.slug || id);
  const catName = (r.categoryName as string) || (r.category as string) || 'Edible Salt';
  const dimensions = r.dimensions && typeof r.dimensions === 'object' ? r.dimensions as { length?: number | null; width?: number | null; height?: number | null } : {};
  const specifications = {
    ...(typeof r.weight === 'number' ? { weightLbs: r.weight } : {}),
    ...(typeof dimensions.length === 'number' ? { lengthIn: dimensions.length } : {}),
    ...(typeof dimensions.width === 'number' ? { widthIn: dimensions.width } : {}),
    ...(typeof dimensions.height === 'number' ? { heightIn: dimensions.height } : {}),
    ...(typeof r.packagePreset === 'string' ? { packagePreset: r.packagePreset } : {}),
  };
  const catId = `cat-${catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const stockQty = typeof r.stockQuantity === 'number' ? r.stockQuantity : (r.stockStatus === 'instock' || r.inStock ? 50 : 0);
  const stockStat = r.stockStatus === 'instock' || r.inStock ? 'in_stock' : (r.stockStatus === 'outofstock' ? 'out_of_stock' : 'in_stock');
  const isListed = r.isListed !== false && r.status !== 'draft';
  const imagesList = rawImgs.length > 0 ? rawImgs : ['/images/placeholder-product.svg'];

  const desc = (r.description as string) || (name ? `${name} — authentic pure Himalayan pink salt from the Himalayan Koh collection.` : '');
  const shortDesc = (r.shortDescription as string) || desc;

  return {
    id,
    slug,
    name,
    shortTitle: name,
    subtitle: catName,
    shortDescription: shortDesc,
    description: desc,
    features: [],
    specifications,
    categoryId: catId,
    categoryName: catName,
    brand: 'Himalayan Koh',
    status: isListed ? 'active' : 'inactive',
    price: priceNum,
    compareAtPrice: compareAt,
    costPrice: typeof r.costPrice === 'number' ? r.costPrice : 0,
    landedCost: typeof r.landedCost === 'number' ? r.landedCost : 0,
    marginPercent: 55,
    currency: 'USD',
    sku: (r.sku as string) || '',
    inventoryQty: stockQty,
    stockStatus: stockStat as CatalogProduct['stockStatus'],
    lowStockThreshold: typeof r.lowStockThreshold === 'number' ? r.lowStockThreshold : 5,
    shippingCost: 0,
    freeShipping: true,
    deliveryMinDays: 2,
    deliveryMaxDays: 5,
    usInventory: true,
    supplierSource: 'WooCommerce',
    intendedSpecies: 'Himalayan Pink Salt',
    commerceReadiness: 'COMMERCE_READY',
    sourceType: 'MANUFACTURER_DIRECT',
    inventorySource: 'INTERNAL_STOCK',
    fulfillmentMethod: 'US_WAREHOUSE',
    supplierUrl: null,
    supplierStockStatus: 'in_stock',
    riskFlags: [],
    tags: ['himalayan-salt', 'pink-salt'],
    featured: !!r.isFeatured,
    newArrival: false,
    // Merchandising claims are NOT fabricated for Woo-backed rows: badges
    // like Trending/Best Rated may only render when real evidence exists
    // (see the Promotions tab guardrails).
    trending: false,
    bestRated: false,
    bestSeller: false,
    promoted: false,
    saleEnabled: compareAt > priceNum,
    seoTitle: typeof r.seoTitle === 'string' && r.seoTitle ? r.seoTitle : `${name} | Himalayan Koh`,
    seoDescription: typeof r.seoDescription === 'string' && r.seoDescription ? r.seoDescription : `${name} - Himalayan Koh product details.`,
    seoTitleStored: typeof r.seoTitle === 'string' && r.seoTitle ? r.seoTitle : null,
    seoDescriptionStored: typeof r.seoDescription === 'string' && r.seoDescription ? r.seoDescription : null,
    seoKeywords: Array.isArray(r.seoKeywords) ? r.seoKeywords.filter((x): x is string => typeof x === 'string') : [],
    canonicalSlug: typeof r.canonicalSlug === 'string' && r.canonicalSlug ? r.canonicalSlug : slug,
    images: imagesList.map((url, i) => ({
      id: `img-${id}-${i}`,
      productId: id,
      url,
      altText: name,
      kind: 'product' as const,
      isPrimary: i === 0,
      sortOrder: i,
    })),
    variants: [],
    createdAt: (r.createdAt as string) || new Date().toISOString(),
    updatedAt: (r.updatedAt as string) || new Date().toISOString(),
    publishedAt: (r.publishedAt as string) || new Date().toISOString(),
  };
}

/**
 * One screen routinely asks for the catalog twice: `listCategories()` derives
 * its list from `listProducts()`, and the products screen calls `listProducts()`
 * as well, so a single mount used to send two identical `/api/admin/catalog`
 * reads (measured on staging: two requests, ~1.3s each, against a WooCommerce
 * read). Concurrent callers now share the one in-flight read.
 */
const shareBrowserCatalogRead = singleFlight<CatalogProduct[]>();

let catalogMemoryCache: { products: CatalogProduct[]; timestamp: number } | null = null;
const CATALOG_CACHE_TTL_MS = 60_000; // 60 seconds TTL

export function invalidateCatalogCache(updatedProduct?: CatalogProduct | null) {
  if (!catalogMemoryCache) return;
  if (updatedProduct) {
    const idx = catalogMemoryCache.products.findIndex((p) => p.id === updatedProduct.id);
    if (idx >= 0) {
      catalogMemoryCache.products[idx] = updatedProduct;
      return;
    }
  }
  catalogMemoryCache = null;
}

export class CatalogLoadError extends Error {
  constructor(message = 'The product catalog could not be loaded.') {
    super(message);
    this.name = 'CatalogLoadError';
  }
}

export function parseAdminCatalogRows(payload: unknown): Record<string, unknown>[] | null {
  const rows = (payload as { page?: { rows?: unknown } } | null)?.page?.rows;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : null;
}

export function parsePublicCatalogRows(payload: unknown): Record<string, unknown>[] | null {
  const rows = (payload as { products?: unknown } | null)?.products;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : null;
}

/** The browser-side read: authenticated admin route first, public route second.
 * A failed read is an error, never an empty catalog. An explicitly empty valid
 * response remains empty so the UI can distinguish zero products from failure. */
async function readBrowserCatalog(): Promise<CatalogProduct[]> {
  const failures: string[] = [];

  try {
    const token = await getFreshAccessToken().catch(() => null);
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch('/api/admin/catalog?perPage=100', { headers });
    if (res.ok) {
      const rows = parseAdminCatalogRows(await res.json());
      if (rows) return rows.map(adminCatalogRowToProduct);
      failures.push('admin catalog returned an invalid response');
    } else {
      failures.push(`admin catalog HTTP ${res.status}`);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'admin catalog request failed');
  }

  try {
    const res = await fetch('/api/catalog');
    if (res.ok) {
      const rows = parsePublicCatalogRows(await res.json());
      if (rows) return rows.map(adminCatalogRowToProduct);
      failures.push('public catalog returned an invalid response');
    } else {
      failures.push(`public catalog HTTP ${res.status}`);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'public catalog request failed');
  }

  throw new CatalogLoadError(failures.length ? failures.join('; ') : undefined);
}

/** All products (any status) with images/variants — admin view. */
export async function listProducts(forceFresh = false): Promise<CatalogProduct[]> {
  if (typeof window !== 'undefined') {
    if (!forceFresh && catalogMemoryCache && (Date.now() - catalogMemoryCache.timestamp < CATALOG_CACHE_TTL_MS)) {
      return catalogMemoryCache.products;
    }
    const res = await shareBrowserCatalogRead(() => readBrowserCatalog());
    catalogMemoryCache = { products: res, timestamp: Date.now() };
    return res;
  }

  return readFromDb();
}

/** The database fallback, used when neither server read answers. */
async function readFromDb(): Promise<CatalogProduct[]> {
  const db = getDb();
  const [rows, { cats, imgs, vars }] = await Promise.all([db.list<ProductRow>('products'), loadRefs()]);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r.id === 'string')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map((r) => rowToProduct(r, cats, imgs, vars));
}

export async function getProduct(id: string): Promise<CatalogProduct | null> {
  // Numeric ids belong to WooCommerce. Always read them directly after a save;
  // the browser catalog cache may still contain the pre-save projection.
  if (isWooId(id)) {
    try {
      const token = await getFreshAccessToken().catch(() => null);
      const res = await fetch(`/api/admin/products/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.product) {
          return adminCatalogRowToProduct(json.product);
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  if (typeof window !== 'undefined') {
    // Fast in-memory cache hit for UUID-backed catalog products.
    if (catalogMemoryCache && (Date.now() - catalogMemoryCache.timestamp < CATALOG_CACHE_TTL_MS)) {
      const found = catalogMemoryCache.products.find((p) => p.id === id || p.slug === id);
      if (found) return found;
    }
    try {
      const prods = await listProducts();
      const found = prods.find((p) => p.id === id || p.slug === id);
      if (found) return found;
    } catch {
      // fallback to db adapter
    }
  }

  const db = getDb();
  // Single-product read: fetch ONLY this product's images/variants plus the
  // category list. rowToProduct filters images/variants by product_id anyway,
  // so pulling the whole catalog's 2000-row lists here was pure wasted
  // payload — and one admin Save calls getProduct up to three times.
  const [row, cats, imgs, vars] = await Promise.all([
    db.get<ProductRow>('products', id),
    db.list<CategoryRow>('categories'),
    // No url filter: the editor must see every image actually saved for THIS
    // product (including any inline-base64 row), or a hidden row is deleted on
    // the next Save (replace semantics) and images silently vanish.
    db.list<ImageRow>('product_images', { limit: 50, filters: { product_id: id } }),
    db.list<VariantRow>('product_variants', { limit: 200, filters: { product_id: id } }),
  ]);
  if (!row || typeof row.id !== 'string') return null;
  return rowToProduct(
    row,
    Array.isArray(cats) ? cats : [],
    Array.isArray(imgs) ? imgs : [],
    Array.isArray(vars) ? vars : [],
  );
}

/**
 * Fast duplicate check without loading the entire catalog's images and variants.
 * Only queries the products table directly (saves 2-5 seconds on save).
 */
export async function checkProductDuplicate(params: {
  url?: string | null;
  itemId?: string | null;
  title?: string;
  sku?: string | null;
}): Promise<{ id: string; name: string } | null> {
  const db = getDb();
  const rows = (await db.list<ProductRow>('products', { limit: 1000 })) || [];
  const u = (params.url || '').trim();
  const it = (params.itemId || '').trim();
  const sk = (params.sku || '').trim();
  for (const p of rows) {
    if (u && p.supplier_url && p.supplier_url.trim() === u) return { id: p.id, name: p.name };
    if (it && (p.supplier_product_ref === it || p.sku === it)) return { id: p.id, name: p.name };
    if (sk && p.sku && p.sku.trim() === sk) return { id: p.id, name: p.name };
  }
  const cleanTitle = (params.title || '').trim().toLowerCase();
  if (cleanTitle) {
    for (const p of rows) {
      if (p.name && p.name.trim().toLowerCase() === cleanTitle) return { id: p.id, name: p.name };
    }
  }
  return null;
}

async function uniqueSlug(db: DbAdapter, base: string, excludeId?: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
  let slug = clean;
  let n = 2;
  for (;;) {
    const existing = await db.findFirst<{ id: string }>('products', 'slug', slug);
    if (!existing || (excludeId && existing.id === excludeId)) return slug;
    slug = `${clean}-${n}`;
    n += 1;
  }
}

export interface ProductInput {
  name: string;
  shortTitle?: string;
  subtitle?: string;
  shortDescription?: string;
  description?: string;
  features?: string[];
  specifications?: Record<string, unknown>;
  categoryId?: string | null;
  brand?: string;
  status?: CatalogStatus;
  price?: number;
  compareAtPrice?: number;
  costPrice?: number;
  landedCost?: number;
  currency?: string;
  sku?: string;
  inventoryQty?: number;
  stockStatus?: string;
  lowStockThreshold?: number;
  shippingCost?: number;
  freeShipping?: boolean;
  deliveryMinDays?: number | null;
  deliveryMaxDays?: number | null;
  shippingNote?: string;
  usInventory?: boolean;
  supplierSource?: string;
  supplierProductRef?: string;
  safetyClass?: CatalogProduct['safetyClass'];
  safetyReviewStatus?: CatalogProduct['safetyReviewStatus'];
  intendedSpecies?: string | null;
  /** Commerce-readiness model fields (migration 0016). */
  commerceReadiness?: CatalogProduct['commerceReadiness'];
  sourceType?: CatalogProduct['sourceType'];
  inventorySource?: CatalogProduct['inventorySource'];
  fulfillmentMethod?: string | null;
  supplierUrl?: string | null;
  supplierStockStatus?: string | null;
  riskFlags?: string[];
  tags?: string[];
  featured?: boolean;
  newArrival?: boolean;
  trending?: boolean;
  bestRated?: boolean;
  bestSeller?: boolean;
  promoted?: boolean;
  saleEnabled?: boolean;
  discountType?: string;
  discountValue?: number;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  canonicalSlug?: string;
  ogImage?: string;
  ownerNotes?: string;
  evidenceNotes?: string;
  sortOrder?: number;
  /** Optional listing end (null = no expiry / Good 'Til Cancelled). */
  listingEndsAt?: string | null;
}

export function productToRow(input: ProductInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    name: input.name,
    // Legacy live schema requires `title` NOT NULL (V2 writes `name`; both
    // must be set — the seed script always did this). writableColumns drops
    // it only where the column truly does not exist.
    title: input.name,
    short_title: input.shortTitle ?? null,
    subtitle: input.subtitle ?? null,
    short_description: input.shortDescription ?? null,
    description: input.description ?? null,
    features: input.features ?? [],
    specifications: input.specifications ?? {},
    category_id: input.categoryId ?? null,
    brand: input.brand ?? 'Himalayan Koh',
    status: input.status ?? 'draft',
    price: input.price ?? 0,
    compare_at_price: input.compareAtPrice ?? null,
    cost_price: input.costPrice ?? null,
    landed_cost: input.landedCost ?? null,
    currency: input.currency ?? 'USD',
    sku: input.sku ?? null,
    inventory_qty: input.inventoryQty ?? 0,
    stock_status: input.stockStatus ?? null,
    low_stock_threshold: input.lowStockThreshold ?? 0,
    shipping_cost: input.shippingCost ?? 0,
    free_shipping: input.freeShipping ?? false,
    delivery_min_days: input.deliveryMinDays ?? null,
    delivery_max_days: input.deliveryMaxDays ?? null,
    shipping_note: input.shippingNote ?? null,
    us_inventory: input.usInventory ?? false,
    supplier_source: input.supplierSource ?? null,
    supplier_product_ref: input.supplierProductRef ?? null,
    safety_class: input.safetyClass ?? null,
    safety_review_status: input.safetyReviewStatus ?? null,
    intended_species: input.intendedSpecies ?? null,
    commerce_readiness: input.commerceReadiness ?? null,
    source_type: input.sourceType ?? null,
    inventory_source: input.inventorySource ?? null,
    fulfillment_method: input.fulfillmentMethod ?? null,
    supplier_url: input.supplierUrl ?? null,
    supplier_stock_status: input.supplierStockStatus ?? null,
    risk_flags: input.riskFlags ?? [],
    tags: input.tags ?? [],
    featured: input.featured ?? false,
    new_arrival: input.newArrival ?? false,
    trending: input.trending ?? false,
    best_rated: input.bestRated ?? false,
    best_seller: input.bestSeller ?? false,
    promoted: input.promoted ?? false,
    sale_enabled: input.saleEnabled ?? false,
    discount_type: input.discountType ?? null,
    discount_value: input.discountValue ?? null,
    seo_title: input.seoTitle ?? null,
    seo_description: input.seoDescription ?? null,
    seo_keywords: input.seoKeywords ?? [],
    canonical_slug: input.canonicalSlug ?? null,
    og_image: input.ogImage ?? null,
    owner_notes: input.ownerNotes ?? null,
    evidence_notes: input.evidenceNotes ?? null,
    sort_order: input.sortOrder ?? 0,
    listing_ends_at: input.listingEndsAt ?? null,
  };
  return row;
}

export async function createProduct(input: ProductInput): Promise<CatalogProduct> {
  const db = getDb();
  const status = await effectiveStatus(input.status ?? 'draft');
  const slug = await uniqueSlug(db, input.name);
  const id = uid();
  const now = new Date().toISOString();
  const row = await db.insert<{ id: string } & Record<string, unknown>>('products', {
    id,
    slug,
    ...(await writableColumns(productToRow({ ...input, status }))),
    created_at: now,
    updated_at: now,
    published_at: status === 'active' ? now : null,
  });
  invalidateCatalogCache();
  return getProduct(row.id).then((p) => p!);
}

// Maps a ProductInput field to the product column(s) it writes. Used to make
// updateProduct a TRUE partial update: only columns whose input field was
// explicitly provided are patched — everything else keeps its existing value
// (editing one field must never null out NOT NULL columns or reset status).
const INPUT_FIELD_TO_COLUMNS: Record<keyof ProductInput, string[]> = {
  name: ['name', 'title'],
  shortTitle: ['short_title'],
  subtitle: ['subtitle'],
  shortDescription: ['short_description'],
  description: ['description'],
  features: ['features'],
  specifications: ['specifications'],
  categoryId: ['category_id'],
  brand: ['brand'],
  status: ['status'],
  price: ['price'],
  compareAtPrice: ['compare_at_price'],
  costPrice: ['cost_price'],
  landedCost: ['landed_cost'],
  currency: ['currency'],
  sku: ['sku'],
  inventoryQty: ['inventory_qty'],
  stockStatus: ['stock_status'],
  lowStockThreshold: ['low_stock_threshold'],
  shippingCost: ['shipping_cost'],
  freeShipping: ['free_shipping'],
  deliveryMinDays: ['delivery_min_days'],
  deliveryMaxDays: ['delivery_max_days'],
  shippingNote: ['shipping_note'],
  usInventory: ['us_inventory'],
  supplierSource: ['supplier_source'],
  supplierProductRef: ['supplier_product_ref'],
  safetyClass: ['safety_class'],
  safetyReviewStatus: ['safety_review_status'],
  intendedSpecies: ['intended_species'],
  commerceReadiness: ['commerce_readiness'],
  sourceType: ['source_type'],
  inventorySource: ['inventory_source'],
  fulfillmentMethod: ['fulfillment_method'],
  supplierUrl: ['supplier_url'],
  supplierStockStatus: ['supplier_stock_status'],
  riskFlags: ['risk_flags'],
  tags: ['tags'],
  featured: ['featured'],
  newArrival: ['new_arrival'],
  trending: ['trending'],
  bestRated: ['best_rated'],
  bestSeller: ['best_seller'],
  promoted: ['promoted'],
  saleEnabled: ['sale_enabled'],
  discountType: ['discount_type'],
  discountValue: ['discount_value'],
  seoTitle: ['seo_title'],
  seoDescription: ['seo_description'],
  seoKeywords: ['seo_keywords'],
  canonicalSlug: ['canonical_slug'],
  ogImage: ['og_image'],
  ownerNotes: ['owner_notes'],
  evidenceNotes: ['evidence_notes'],
  sortOrder: ['sort_order'],
  listingEndsAt: ['listing_ends_at'],
};

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<CatalogProduct | null> {
  // Woo-sourced product (numeric WooCommerce id, no row in the local catalog
  // table): route the edit through the server Woo write API directly.
  if (isWooId(id)) {
    return updateWooProductViaApi(id, input);
  }
  const db = getDb();
  const existing = await db.get<ProductRow>('products', id);
  if (!existing) return null;
  // Only fields present in the partial input are read below (field in input).
  const full = productToRow(input as ProductInput);
  const patch: Record<string, unknown> = {};
  for (const field of Object.keys(INPUT_FIELD_TO_COLUMNS) as (keyof ProductInput)[]) {
    if (field in input) {
      for (const col of INPUT_FIELD_TO_COLUMNS[field]) patch[col] = full[col];
    }
  }
  // Status changes go through the fail-closed gate (pre-0010 clamp), and an
  // explicit status is only applied when the caller actually provided one.
  if ('status' in input && typeof input.status === 'string') {
    patch.status = await effectiveStatus(input.status as CatalogStatus);
    if (patch.status === 'active' && !existing.published_at) patch.published_at = new Date().toISOString();
  }
  const effectivePatch = await writableColumns(patch);
  if ('name' in input && input.name && input.name !== existing.name) {
    effectivePatch.slug = await uniqueSlug(db, input.name, id);
  }
  await db.update('products', id, effectivePatch);
  invalidateCatalogCache();
  return getProduct(id);
}

export async function setProductStatus(id: string, status: CatalogStatus): Promise<CatalogProduct | null> {
  if (isWooId(id)) {
    return updateWooProductViaApi(id, { status });
  }
  const db = getDb();
  const existing = await db.get<ProductRow>('products', id);
  if (!existing) return null;
  const effective = await effectiveStatus(status);
  const patch: Record<string, unknown> = { status: effective };
  if (effective === 'active' && !existing.published_at) patch.published_at = new Date().toISOString();
  await db.update('products', id, patch);
  invalidateCatalogCache();
  return getProduct(id);
}

/** Archive keeps history (preferred over hard delete). Woo-aware: drafts the Woo record. */
export async function archiveProduct(id: string): Promise<boolean> {
  if (isWooId(id)) {
    const updated = await updateWooProductViaApi(id, { status: 'draft' });
    return !!updated;
  }
  const db = getDb();
  const existing = await db.get<ProductRow>('products', id);
  if (!existing) return false;
  const updated = await setProductStatus(id, 'archived');
  return !!updated;
}

export async function hardDeleteProduct(id: string): Promise<void> {
  if (isWooId(id)) {
    const token = await getFreshAccessToken().catch(() => null);
    await fetch(`/api/admin/products/${id}?action=trash`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    invalidateCatalogCache();
    return;
  }
  const db = getDb();
  // Images/variants cascade via FK (product_images, product_variants).
  await db.remove('products', id);
}

// ---------------------------------------------------------------------------
// WooCommerce server bridge — Woo-sourced products (numeric ids) are not rows
// in the local catalog table, so their edits must go through the server-side
// Woo write API (`/api/admin/products/[id]`), which holds the credentials.
// ---------------------------------------------------------------------------

const WOO_STATUS_BY_LOCAL: Record<string, string> = {
  active: 'publish',
  inactive: 'private',
  archived: 'draft',
};

/**
 * PATCH the WooCommerce product through the authenticated server route and
 * return the refreshed catalog view of it. Only fields the caller supplied
 * are sent — Woo keeps everything else.
 */
async function updateWooProductViaApi(id: string, input: Partial<ProductInput>): Promise<CatalogProduct | null> {
  if (!isWooId(id)) return null;
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;
  if (input.shortDescription !== undefined) body.shortDescription = input.shortDescription;
  if (input.sku !== undefined) body.sku = input.sku;
  if (input.price !== undefined) body.price = input.price;
  if (input.compareAtPrice !== undefined) body.compareAtPrice = input.compareAtPrice;
  if (input.costPrice !== undefined) body.costPrice = input.costPrice;
  if (input.landedCost !== undefined) body.landedCost = input.landedCost;
  if (input.specifications !== undefined) {
    const specs = input.specifications as Record<string, unknown>;
    body.weight = typeof specs.weightLbs === 'number' ? specs.weightLbs : undefined;
    body.dimensions = {
      length: typeof specs.lengthIn === 'number' ? specs.lengthIn : undefined,
      width: typeof specs.widthIn === 'number' ? specs.widthIn : undefined,
      height: typeof specs.heightIn === 'number' ? specs.heightIn : undefined,
    };
    body.packagePreset = typeof specs.packagePreset === 'string' ? specs.packagePreset : undefined;
  }
  if (input.seoKeywords !== undefined) body.seoKeywords = input.seoKeywords;
  if (input.canonicalSlug !== undefined) {
    body.canonicalSlug = input.canonicalSlug;
    body.slug = input.canonicalSlug;
  }
  if (input.featured !== undefined) body.featured = input.featured;
  if (input.tags !== undefined) body.tags = input.tags;
  if (input.status !== undefined) {
    body.status = WOO_STATUS_BY_LOCAL[input.status] ?? (input.status === 'draft' ? 'draft' : 'publish');
  }
  const imgInput = input as { images?: Array<{ url?: string | null } | string> };
  if (imgInput.images !== undefined) {
    body.images = imgInput.images
      .map((i) => (typeof i === 'string' ? i : String(i.url || '')))
      .filter(Boolean);
  }
  if (input.inventoryQty !== undefined || input.stockStatus !== undefined || input.lowStockThreshold !== undefined) {
    // Woo requires manage_stock=true for stock_quantity to take effect; the
    // editor's Own Stock model is “internal quantity is authoritative”, so an
    // inventory edit enables stock management rather than silently no-op'ing.
    if (!body.manageStock) body.manageStock = true;
    if (input.inventoryQty !== undefined && input.inventoryQty !== null) body.stockQuantity = input.inventoryQty;
    if (input.stockStatus !== undefined) {
      body.stockStatus = input.stockStatus === 'out_of_stock' ? 'outofstock' : input.stockStatus === 'on_backorder' ? 'onbackorder' : 'instock';
    }
    if (input.lowStockThreshold !== undefined) body.lowStockAmount = input.lowStockThreshold;
  }
  if (input.seoTitle !== undefined || input.seoDescription !== undefined) {
    body.seo = {
      ...(input.seoTitle !== undefined ? { title: input.seoTitle } : {}),
      ...(input.seoDescription !== undefined ? { description: input.seoDescription } : {}),
    };
  }
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  if (!Object.keys(body).length) return getProduct(id);

  const token = await getFreshAccessToken().catch(() => null);
  const res = await fetch(`/api/admin/products/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Woo save failed (${res.status}): ${detail.slice(0, 160)}`);
  }
  const json = await res.json().catch(() => null);
  if (Array.isArray(json?.ignored) && json.ignored.length > 0) {
    const details = json.ignored.map((item: { field?: string; reason?: string }) => `${item.field || 'field'}: ${item.reason || 'not applied'}`).join(' ');
    throw new Error(`WooCommerce did not apply this save. ${details}`);
  }
  const updated = json?.product ? adminCatalogRowToProduct(json.product) : null;
  invalidateCatalogCache(updated);
  return updated ?? getProduct(id);
}

export async function duplicateProduct(id: string): Promise<CatalogProduct | null> {
  const db = getDb();
  const src = await getProduct(id);
  if (!src) return null;
  const baseName = `${src.name} (Copy)`;
  const slug = await uniqueSlug(db, baseName);
  const now = new Date().toISOString();
  const newId = uid();
  await db.insert('products', {
    id: newId,
    slug,
    ...(await writableColumns(productToRow({ ...src, name: baseName, sku: src.sku ? `${src.sku}-COPY` : '', status: 'draft' }))),
    created_at: now,
    updated_at: now,
    published_at: null,
  });
  const legacy = await legacyImageColumns();
  for (const img of src.images) {
    const payload: Record<string, unknown> = {
      url: img.url,
      alt_text: img.altText,
      kind: img.kind,
      is_primary: img.isPrimary,
      sort_order: img.sortOrder,
      variant_id: null,
    };
    if (legacy.storagePath) payload.storage_path = imageStoragePath(newId, img.url, img.sortOrder);
    if (legacy.publicUrl) payload.public_url = img.url;
    if (legacy.createdAt) payload.created_at = now;
    await db.insert('product_images', { id: uid(), product_id: newId, ...payload });
  }
  const legacyV = await legacyVariantColumns();
  for (const v of src.variants) {
    const payload: Record<string, unknown> = {
      attributes: v.attributes,
      sku: v.sku,
      price: v.price,
      compare_at_price: v.compareAtPrice,
      cost_price: v.costPrice,
      inventory_qty: v.inventoryQty,
      status: v.status,
      low_stock_threshold: v.lowStockThreshold,
    };
    if (legacyV.title) {
      const parts = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`);
      payload.title = parts.length ? parts.join(' · ') : (v.sku ? `Variant ${v.sku}` : 'Variant');
    }
    if (legacyV.priceAmount) payload.price_amount = v.price != null ? Math.round(v.price * 100) : 0;
    if (legacyV.optionValues) payload.option_values = v.attributes;
    if (legacyV.timestamps) { payload.created_at = now; payload.updated_at = now; }
    await db.insert('product_variants', { id: uid(), product_id: newId, ...payload });
  }
  return getProduct(newId);
}

// ---------------------------------------------------------------------------
// Images (add / remove / replace / reorder / primary / alt / variant link)
// ---------------------------------------------------------------------------
export interface CatalogImageInput {
  id?: string;
  url: string;
  altText?: string;
  kind?: CatalogImage['kind'];
  isPrimary?: boolean;
  sortOrder?: number;
  variantId?: string | null;
}

/** Replace the full image set of a product (admin image manager). */
/**
 * Legacy live schema requires product_images.storage_path + public_url NOT
 * NULL (V2 writes `url`). We do not use Supabase Storage for supplier-sourced
 * images: public_url carries the real image URL; storage_path is a synthetic
 * per-image path (unique, honest, identifies the source) so rows satisfy the
 * constraint. Only applied when those columns exist in the live schema.
 */
async function legacyImageColumns(): Promise<{ storagePath?: boolean; publicUrl?: boolean; createdAt?: boolean }> {
  const cols = await liveTableColumns('product_images', IMAGE_PROBE_COLUMNS);
  if (!cols) return {};
  return {
    storagePath: cols.has('storage_path'),
    publicUrl: cols.has('public_url'),
    createdAt: cols.has('created_at'),
  };
}

function imageStoragePath(productId: string, url: string, order: number): string {
  const base = String(url || 'image').split(/[?#]/)[0].split('/').pop() || 'image';
  return `catalog/${productId}/${order}-${base}`;
}

/** Callers that ignore the returned product should pass `reload: false` —
 *  each reload is a full product read the save path does not need. */
export interface SaveRefsOptions {
  reload?: boolean;
}

/** Replace the full image set of a product (admin image manager). */
export async function saveProductImages(productId: string, images: CatalogImageInput[], opts: SaveRefsOptions = {}): Promise<CatalogProduct | null> {
  if (isWooId(productId)) {
    // Filter out invalid image URLs before sending to WooCommerce — relative
    // paths, SVGs, and placeholder images cause Woo to reject the entire save
    // with woocommerce_product_image_upload_error.
    const validImages = images
      .map((i) => ({ url: i.url } as { url: string }))
      .filter((i) => {
        if (!i.url || !/^https?:\/\//i.test(i.url)) return false;
        if (/\.svg(\?|$)/i.test(i.url)) return false;
        if (/(placeholder|favicon|icon|badge|sprite|loader|spinner|pixel)/i.test(i.url)) return false;
        return true;
      });
    if (validImages.length === 0 && images.length > 0) {
      throw new Error('None of the attached image URLs are valid for WooCommerce. Add at least one valid image URL (JPEG, PNG, or WebP).');
    }
    const updated = await updateWooProductViaApi(productId, {
      images: validImages,
    } as unknown as Partial<ProductInput>);
    return opts.reload === false ? null : (updated ?? getProduct(productId));
  }
  const db = getDb();
  const legacy = await legacyImageColumns();
  // Only this product's rows (was: the entire product_images table, then a
  // client-side filter — a large payload on every Save).
  const existing = (await db.list<ImageRow>('product_images', { limit: 200, filters: { product_id: productId } })) || [];
  const incomingIds = new Set(images.filter((i) => i.id).map((i) => i.id as string));
  // Removals + writes are independent of each other (sort_order is explicit on
  // every row), so they run concurrently instead of one round-trip per image.
  await Promise.all(existing.filter((old) => !incomingIds.has(old.id)).map((old) => db.remove('product_images', old.id)));
  const writes: Promise<unknown>[] = [];
  images.forEach((img, idx) => {
    const order = img.sortOrder ?? idx;
    const payload: Record<string, unknown> = {
      url: img.url,
      alt_text: img.altText ?? null,
      kind: img.kind ?? 'product',
      is_primary: img.isPrimary ?? false,
      sort_order: order,
      variant_id: img.variantId ?? null,
    };
    if (legacy.storagePath) payload.storage_path = imageStoragePath(productId, img.url, order);
    if (legacy.publicUrl) payload.public_url = img.url;
    if (legacy.createdAt) payload.created_at = new Date().toISOString();
    if (img.id && existing.some((e) => e.id === img.id)) {
      writes.push(db.update<{ id: string } & Record<string, unknown>>('product_images', img.id, payload));
    } else {
      writes.push(db.insert('product_images', { id: img.id || uid(), product_id: productId, ...payload }));
    }
  });
  await Promise.all(writes);
  return opts.reload === false ? null : getProduct(productId);
}

// ---------------------------------------------------------------------------
// Variants (add / remove / update)
// ---------------------------------------------------------------------------
export interface CatalogVariantInput {
  id?: string;
  attributes?: Record<string, string>;
  sku?: string;
  price?: number | null;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  inventoryQty?: number;
  status?: string;
  lowStockThreshold?: number;
}

/**
 * Legacy live schema requires product_variants.title + price_amount +
 * option_values + created_at/updated_at NOT NULL. These are faithful mirrors
 * of the V2 fields (the storefront reads attributes/price/sku — never these
 * legacy mirrors). title is derived from the real option attributes; price
 * is never invented — null price maps to price_amount 0 (legacy only).
 */
async function legacyVariantColumns(): Promise<{ title?: boolean; priceAmount?: boolean; optionValues?: boolean; timestamps?: boolean }> {
  const cols = await liveTableColumns('product_variants', VARIANT_PROBE_COLUMNS);
  if (!cols) return {};
  return {
    title: cols.has('title'),
    priceAmount: cols.has('price_amount'),
    optionValues: cols.has('option_values'),
    timestamps: cols.has('created_at') || cols.has('updated_at'),
  };
}

/** Replace the full variant set of a product (admin variant manager). */
export async function saveProductVariants(productId: string, variants: CatalogVariantInput[], opts: SaveRefsOptions = {}): Promise<CatalogProduct | null> {
  if (isWooId(productId)) {
    const wooVariations = variants
      .filter((v) => v.id && /^\d+$/.test(v.id))
      .map((v) => ({
        id: Number(v.id),
        regularPrice: v.price != null ? String(v.price) : undefined,
        salePrice: v.compareAtPrice != null ? String(v.price) : undefined,
        sku: v.sku || undefined,
        manageStock: v.inventoryQty !== undefined,
        stockQuantity: v.inventoryQty,
        stockStatus: v.status === 'inactive' ? 'outofstock' : 'instock',
      }));
    if (wooVariations.length > 0) {
      const token = await getFreshAccessToken().catch(() => null);
      await fetch(`/api/admin/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ variations: wooVariations }),
      });
    }
    return opts.reload === false ? null : getProduct(productId);
  }
  const db = getDb();
  const legacy = await legacyVariantColumns();
  // Only this product's rows (was: the entire product_variants table).
  const existing = (await db.list<VariantRow>('product_variants', { limit: 500, filters: { product_id: productId } })) || [];
  const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id as string));
  await Promise.all(existing.filter((old) => !incomingIds.has(old.id)).map((old) => db.remove('product_variants', old.id)));
  const now = new Date().toISOString();
  const writes: Promise<unknown>[] = [];
  for (const v of variants) {
    const attrs = v.attributes ?? {};
    const payload: Record<string, unknown> = {
      attributes: attrs,
      sku: v.sku ?? null,
      price: v.price ?? null,
      compare_at_price: v.compareAtPrice ?? null,
      cost_price: v.costPrice ?? null,
      inventory_qty: v.inventoryQty ?? 0,
      status: v.status ?? 'active',
      low_stock_threshold: v.lowStockThreshold ?? 0,
    };
    if (legacy.title) {
      const parts = Object.entries(attrs).map(([k, val]) => `${k}: ${val}`);
      payload.title = parts.length ? parts.join(' · ') : (v.sku ? `Variant ${v.sku}` : 'Variant');
    }
    if (legacy.priceAmount) payload.price_amount = v.price != null ? Math.round(v.price * 100) : 0;
    if (legacy.optionValues) payload.option_values = attrs;
    if (legacy.timestamps) { payload.created_at = now; payload.updated_at = now; }
    if (v.id && existing.some((e) => e.id === v.id)) {
      writes.push(db.update<{ id: string } & Record<string, unknown>>('product_variants', v.id, payload));
    } else {
      writes.push(db.insert('product_variants', { id: v.id || uid(), product_id: productId, ...payload }));
    }
  }
  await Promise.all(writes);
  return opts.reload === false ? null : getProduct(productId);
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------
interface CouponRow {
  id: string;
  code: string;
  description?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  min_cart_value?: number | null;
  eligible_product_ids?: unknown;
  eligible_category_ids?: unknown;
  start_at?: string | null;
  end_at?: string | null;
  usage_limit?: number | null;
  used_count?: number | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [k: string]: unknown;
}

function couponFromRow(r: CouponRow): Coupon {
  return {
    id: r.id,
    code: r.code,
    description: r.description || undefined,
    discountType: r.discount_type === 'fixed' ? 'fixed' : 'percent',
    discountValue: num(r.discount_value),
    minCartValue: num(r.min_cart_value),
    eligibleProductIds: strArr(r.eligible_product_ids),
    eligibleCategoryIds: strArr(r.eligible_category_ids),
    startAt: r.start_at || null,
    endAt: r.end_at || null,
    usageLimit: r.usage_limit != null ? num(r.usage_limit) : null,
    usedCount: num(r.used_count),
    isActive: r.is_active !== false,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || r.created_at || '',
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  const db = getDb();
  try {
    const rows = (await db.list<CouponRow>('coupons')) || [];
    return rows.map(couponFromRow).sort((a, b) => a.code.localeCompare(b.code));
  } catch {
    // Pre-0010 the coupons table does not exist yet — degrade to empty.
    return [];
  }
}

export async function getCouponByCode(code: string): Promise<Coupon | null> {
  const db = getDb();
  try {
    const row = await db.findFirst<CouponRow>('coupons', 'code', code.trim().toUpperCase());
    return row ? couponFromRow(row) : null;
  } catch {
    return null;
  }
}

export interface CouponInput {
  code: string;
  description?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minCartValue?: number;
  eligibleProductIds?: string[];
  eligibleCategoryIds?: string[];
  startAt?: string | null;
  endAt?: string | null;
  usageLimit?: number | null;
  isActive?: boolean;
}

export async function createCoupon(input: CouponInput): Promise<Coupon> {
  const db = getDb();
  const now = new Date().toISOString();
  const row = await db.insert<{ id: string } & Record<string, unknown>>('coupons', {
    id: uid(),
    code: input.code.trim().toUpperCase(),
    description: input.description ?? null,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_cart_value: input.minCartValue ?? 0,
    eligible_product_ids: input.eligibleProductIds ?? [],
    eligible_category_ids: input.eligibleCategoryIds ?? [],
    start_at: input.startAt ?? null,
    end_at: input.endAt ?? null,
    usage_limit: input.usageLimit ?? null,
    used_count: 0,
    is_active: input.isActive ?? true,
    created_at: now,
    updated_at: now,
  });
  return getCouponByCode(String(row.code || input.code)).then((c) => c!);
}

export async function updateCoupon(id: string, input: CouponInput): Promise<Coupon | null> {
  const db = getDb();
  const existing = await db.get<CouponRow>('coupons', id);
  if (!existing) return null;
  await db.update<{ id: string } & Record<string, unknown>>('coupons', id, {
    code: input.code.trim().toUpperCase(),
    description: input.description ?? null,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_cart_value: input.minCartValue ?? 0,
    eligible_product_ids: input.eligibleProductIds ?? [],
    eligible_category_ids: input.eligibleCategoryIds ?? [],
    start_at: input.startAt ?? null,
    end_at: input.endAt ?? null,
    usage_limit: input.usageLimit ?? null,
    is_active: input.isActive ?? true,
  });
  return getCouponByCode(input.code.trim().toUpperCase());
}

export async function deleteCoupon(id: string): Promise<void> {
  await getDb().remove('coupons', id);
}

export interface CouponValidation {
  ok: boolean;
  message?: string;
  discount: number;
  coupon?: Coupon;
}

/**
 * Validate + compute a coupon against a cart. Eligibility uses the REAL
 * product ids/category ids present in the cart. Never fabricates eligibility.
 */
export function validateCoupon(
  coupon: Coupon | null,
  subtotal: number,
  cart: { productId: string; categoryId?: string | null }[],
  now: Date = new Date(),
): CouponValidation {
  if (!coupon) return { ok: false, message: 'Coupon not found', discount: 0 };
  if (!coupon.isActive) return { ok: false, message: 'This coupon is not active', discount: 0 };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, message: 'This coupon has reached its usage limit', discount: 0 };
  }
  if (coupon.startAt && now < new Date(coupon.startAt)) return { ok: false, message: 'This coupon is not active yet', discount: 0 };
  if (coupon.endAt && now > new Date(coupon.endAt)) return { ok: false, message: 'This coupon has expired', discount: 0 };
  if (subtotal < coupon.minCartValue) {
    return { ok: false, message: `Minimum order of $${coupon.minCartValue.toFixed(2)} required`, discount: 0 };
  }
  const eligibleProducts = coupon.eligibleProductIds.length > 0;
  const eligibleCategories = coupon.eligibleCategoryIds.length > 0;
  if (eligibleProducts || eligibleCategories) {
    const applicable = cart.some((item) =>
      (eligibleProducts && coupon.eligibleProductIds.includes(item.productId)) ||
      (eligibleCategories && item.categoryId != null && coupon.eligibleCategoryIds.includes(item.categoryId)),
    );
    if (!applicable) return { ok: false, message: 'This coupon does not apply to items in your cart', discount: 0 };
  }
  let discount = 0;
  if (coupon.discountType === 'percent') {
    discount = Math.round(subtotal * (coupon.discountValue / 100) * 100) / 100;
  } else {
    discount = Math.min(subtotal, coupon.discountValue);
  }
  return { ok: true, discount, coupon };
}

// ---------------------------------------------------------------------------
// Store offers
// ---------------------------------------------------------------------------
interface OfferRow {
  id: string;
  name: string;
  offer_type?: string | null;
  value?: number | null;
  product_ids?: unknown;
  category_ids?: unknown;
  is_active?: boolean | null;
  start_at?: string | null;
  end_at?: string | null;
  created_at?: string | null;
  [k: string]: unknown;
}

export async function listOffers(): Promise<StoreOffer[]> {
  const db = getDb();
  try {
    const rows = (await db.list<OfferRow>('store_offers')) || [];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      offerType: (r.offer_type as StoreOffer['offerType']) || 'percentage',
      value: r.value != null ? num(r.value) : null,
      productIds: strArr(r.product_ids),
      categoryIds: strArr(r.category_ids),
      isActive: r.is_active !== false,
      startAt: r.start_at || null,
      endAt: r.end_at || null,
      createdAt: r.created_at || '',
    }));
  } catch {
    // Pre-0010 the store_offers table does not exist yet — degrade to empty.
    return [];
  }
}

export interface OfferInput {
  name: string;
  offerType: StoreOffer['offerType'];
  value?: number | null;
  productIds?: string[];
  categoryIds?: string[];
  isActive?: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

export async function createOffer(input: OfferInput): Promise<StoreOffer> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uid();
  await db.insert('store_offers', {
    id,
    name: input.name,
    offer_type: input.offerType,
    value: input.value ?? null,
    product_ids: input.productIds ?? [],
    category_ids: input.categoryIds ?? [],
    is_active: input.isActive ?? true,
    start_at: input.startAt ?? null,
    end_at: input.endAt ?? null,
    created_at: now,
    updated_at: now,
  });
  return listOffers().then((all) => all.find((o) => o.id === id)!);
}

export async function updateOffer(id: string, input: OfferInput): Promise<StoreOffer | null> {
  const db = getDb();
  const existing = await db.get<OfferRow>('store_offers', id);
  if (!existing) return null;
  await db.update<{ id: string } & Record<string, unknown>>('store_offers', id, {
    name: input.name,
    offer_type: input.offerType,
    value: input.value ?? null,
    product_ids: input.productIds ?? [],
    category_ids: input.categoryIds ?? [],
    is_active: input.isActive ?? true,
    start_at: input.startAt ?? null,
    end_at: input.endAt ?? null,
  });
  return listOffers().then((all) => all.find((o) => o.id === id) || null);
}

export async function deleteOffer(id: string): Promise<void> {
  await getDb().remove('store_offers', id);
}

// ---------------------------------------------------------------------------
// Store settings (free-shipping strategy etc.)
// ---------------------------------------------------------------------------
const FREE_SHIPPING_KEY = 'free_shipping';

export async function getStoreSettings(): Promise<StoreSettings> {
  const db = getDb();
  try {
    const row = await db.findFirst<{ key: string; value?: unknown }>('store_settings', 'key', FREE_SHIPPING_KEY);
    if (!row || !row.value || typeof row.value !== 'object') return { ...DEFAULT_STORE_SETTINGS };
    const v = row.value as Partial<StoreSettings>;
    return {
      freeShippingEnabled: typeof v.freeShippingEnabled === 'boolean' ? v.freeShippingEnabled : DEFAULT_STORE_SETTINGS.freeShippingEnabled,
      freeShippingThreshold: typeof v.freeShippingThreshold === 'number' ? v.freeShippingThreshold : DEFAULT_STORE_SETTINGS.freeShippingThreshold,
      defaultDeliveryMinDays: v.defaultDeliveryMinDays ?? DEFAULT_STORE_SETTINGS.defaultDeliveryMinDays,
      defaultDeliveryMaxDays: v.defaultDeliveryMaxDays ?? DEFAULT_STORE_SETTINGS.defaultDeliveryMaxDays,
    };
  } catch {
    return { ...DEFAULT_STORE_SETTINGS };
  }
}

export async function saveStoreSettings(settings: StoreSettings): Promise<StoreSettings> {
  const db = getDb();    const now = new Date().toISOString();
  const existing = await db.findFirst<{ key: string }>('store_settings', 'key', FREE_SHIPPING_KEY).catch(() => null);
  if (existing) {
    // store_settings PK is `key`, not `id` — update by the real column.
    await db.updateBy('store_settings', 'key', FREE_SHIPPING_KEY, { value: settings, updated_at: now });
  } else {
    await db.insertRaw('store_settings', { key: FREE_SHIPPING_KEY, value: settings, updated_at: now });
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Shipping calculation (honest — config-driven, never invented)
// ---------------------------------------------------------------------------
export interface ShippingQuote {
  enabled: boolean;
  threshold: number;
  freeEligible: boolean;
  standardCost: number;
}

/** Free-shipping strategy: storewide threshold OR per-product flag. */
export function quoteShipping(
  settings: StoreSettings,
  cart: { productFreeShipping: boolean; productSubtotal: number }[],
): ShippingQuote {
  const subtotal = cart.reduce((s, c) => s + c.productSubtotal, 0);
  const anyProductFree = cart.length > 0 && cart.every((c) => c.productFreeShipping);
  const freeEligible = anyProductFree || (settings.freeShippingEnabled && subtotal >= settings.freeShippingThreshold);
  return {
    enabled: settings.freeShippingEnabled,
    threshold: settings.freeShippingThreshold,
    freeEligible,
    standardCost: 4.99,
  };
}
