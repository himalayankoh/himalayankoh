// ============================================================================
// CATALOG REPOSITORY — the admin console's compatibility layer
//
// The console's screens (CatalogAdmin, AdminSection, AIImportPanel,
// ListingTaskAdmin, HermesIntel) were written against this module, so its
// signatures are the contract: `listProducts()`, `updateProduct(...)`,
// `saveProductImages(...)`, `CatalogProduct`, `ProductInput`.
//
// ## What changed underneath
//
// It used to write to the app's own `products` / `product_images` /
// `product_variants` / `coupons` / `store_offers` tables in Supabase, over a
// hand-rolled PostgREST client built in the browser. Two catalogs existed as a
// result: the storefront's (WooCommerce) and the console's (Postgres), and they
// disagreed — a product saved in the console need not be a product the store had
// ever heard of.
//
// Now there is one. Products, categories and coupons are WooCommerce's, read and
// written through the console's own authenticated routes (`/api/admin/*`), which
// are the only side that holds a WooCommerce consumer key. This module never
// touches a credential and never talks to a database directly.
//
// ## Two kinds of data, one home each
//
// - **Commerce** (products, categories, coupons, inventory) → WooCommerce.
//   `updateProduct`, `saveProductImages` and `saveProductVariants` are one-way
//   doors: a failed save throws with the store's own message, so the console can
//   never report success for a write that did not land.
// - **The console's own working state** (store offers, the free-shipping
//   settings blob) → the hk-storefront plugin's record store via
//   `services/db.ts`. These are not commerce: nothing in WooCommerce can hold
//   them and nothing on the storefront reads them.
//
// ## Conversions live here
//
// Woo's wire shapes are mapped to the UI's models in this one file
// (`catalogRowToProduct`, `wooCategoryToCatalog`, `wooCouponToCoupon`) rather
// than in React components, so there is exactly one place to change when either
// side moves.
// ============================================================================

import { getDb, type DbAdapter } from '../../services/db';
import { getFreshAccessToken } from '../../services/wordpressAdminAuth';
import { singleFlight } from '../../lib/admin/singleFlight';
import {
  CatalogProduct, CatalogCategory, CatalogImage, CatalogVariant, Coupon,
  StoreOffer, StoreSettings, DEFAULT_STORE_SETTINGS,
  CatalogStatus, StockStatus,
} from './types';
import { parseTagList } from './tags';
import { consoleStatusFromWoo, wooListingStatusOrDraft } from '../../lib/woo/productStatus';
import { CONSOLE_META_FIELDS, variationPriceFields, wooImageSources } from '../../lib/woo/productPayload';

export function uid(): string {
  try {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** WooCommerce ids are numeric; everything else is not a store id. */
export function isWooId(id: string): boolean {
  return /^\d+$/.test(id);
}

/**
 * Kept because fifteen call sites still pass a token here.
 *
 * It used to hand the signed-in admin's JWT to the PostgREST adapter. The
 * adapter that replaced it authenticates each request through
 * `wordpressAdminAuth.getFreshAccessToken()` itself, so there is no token to
 * set — and the reload that lands in WordPress's model is the cookie/session,
 * not a value this console can hold. A no-op with a reason beats fifteen
 * callers each inventing their own.
 */
export function setDbToken(_token: string | null): void {
  void _token;
}

// ---------------------------------------------------------------------------
// The console's authenticated door
// ---------------------------------------------------------------------------

async function adminHeaders(): Promise<Record<string, string>> {
  const token = await getFreshAccessToken().catch(() => null);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(await adminHeaders()), ...(init?.headers || {}) } });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (body.error) throw new Error(body.error);
    // A gateway or runtime failure answers with an HTML error page rather than
    // JSON, so there is no message to pass on. Say what is safe and useful — the
    // save did not happen — instead of leaving the owner with a bare status.
    const gateway = response.status >= 500
      ? ' The store gateway failed, so the change was not saved — try again in a moment.'
      : '';
    throw new Error(`${path} answered HTTP ${response.status}.${gateway}`);
  }
  return body as T;
}

/** The console's catalog read failed — never an empty catalog. */
export class CatalogLoadError extends Error {
  constructor(message = 'The product catalog could not be loaded.') {
    super(message);
    this.name = 'CatalogLoadError';
  }
}

// ---------------------------------------------------------------------------
// Woo row → UI model
// ---------------------------------------------------------------------------

export function parseAdminCatalogRows(payload: unknown): Record<string, unknown>[] | null {
  const rows = (payload as { page?: { rows?: unknown } } | null)?.page?.rows;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : null;
}

export function parsePublicCatalogRows(payload: unknown): Record<string, unknown>[] | null {
  const rows = (payload as { products?: unknown } | null)?.products;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function asTextList(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : null;
}

/**
 * One WooCommerce product (as the admin read reports it) → the console's model.
 *
 * Merchandising claims are deliberately NOT invented: badging a row Trending or
 * Best Rated needs evidence, and a product that arrived from the store carries
 * none. Badges therefore start false and the Promotions tab decides.
 */
function catalogRowToProduct(r: Record<string, unknown>): CatalogProduct {
  const priceNum = typeof r.priceMin === 'number'
    ? r.priceMin
    : parseFloat(String(r.price || '').replace(/[^0-9.]/g, '')) || 0;
  const compareAt = typeof r.compareAtPrice === 'number' ? r.compareAtPrice : 0;
  // Two shapes reach this reader: the admin DTO reports image URLs as strings,
  // while a raw WooCommerce row reports objects (`{ id, src }`). Reading the
  // object with `String(...)` produced the literal "[object Object]" as an image
  // URL, which the editor then showed as a broken card and a save sent back to
  // the store — so both shapes are read here, and anything with no src is
  // dropped rather than stringified.
  const imageSource = (entry: unknown): string => {
    if (typeof entry === 'string') return entry.trim();
    if (entry && typeof entry === 'object') {
      const src = (entry as { src?: unknown }).src;
      return typeof src === 'string' ? src.trim() : '';
    }
    return '';
  };
  const rawImgs = (Array.isArray(r.images) && r.images.length > 0
    ? (r.images as unknown[]).map(imageSource)
    : (r.image ? [imageSource(r.image) || String(r.image).trim()] : [])
  ).filter(Boolean);
  const name = String(r.name || 'Untitled Product');
  const id = String(r.id);
  const slug = String(r.slug || id);
  // The admin product DTO reports categories as parallel id/name arrays while a
  // catalog row reports a single name. Both shapes are read here: without the
  // array, the editor showed the "Uncategorized" placeholder on a product
  // WooCommerce had actually filed under "Bulk and Rock Salt" (measured live).
  const categoryNames = Array.isArray(r.categoryNames)
    ? (r.categoryNames as unknown[]).map(String).filter(Boolean)
    : [];
  const catName = (r.categoryName as string) || (r.category as string) || categoryNames[0] || 'Uncategorized';
  const dimensions = r.dimensions && typeof r.dimensions === 'object'
    ? (r.dimensions as { length?: number | null; width?: number | null; height?: number | null })
    : {};
  const specifications = {
    ...(typeof r.weight === 'number' ? { weightLbs: r.weight } : {}),
    ...(typeof dimensions.length === 'number' ? { lengthIn: dimensions.length } : {}),
    ...(typeof dimensions.width === 'number' ? { widthIn: dimensions.width } : {}),
    ...(typeof dimensions.height === 'number' ? { heightIn: dimensions.height } : {}),
    ...(typeof r.packagePreset === 'string' ? { packagePreset: r.packagePreset } : {}),
  };
  // The store's numeric category id is what the editor's select is built from,
  // so it wins over a display name when the read reports one.
  const categoryIds = Array.isArray(r.categoryIds)
    ? (r.categoryIds as unknown[]).map(String).filter(Boolean)
    : [];
  // Only a numeric value is a term id. The list read reports the category *name*
  // in `categoryId` (its facet id), and treating that as an id put a value in the
  // selector that no option matched — so the row's category rendered blank and an
  // edit looked like it had started from no category at all. A name is kept for
  // display (`categoryName`) and never offered as the id.
  const numericCategoryId = typeof r.categoryId === 'number'
    ? String(r.categoryId)
    : typeof r.categoryId === 'string' && /^\d+$/.test(r.categoryId.trim())
      ? r.categoryId.trim()
      : null;
  const catId = categoryIds[0] ?? numericCategoryId ?? '';
  const trackInventory = typeof r.trackInventory === 'boolean'
    ? r.trackInventory
    : (typeof r.manageStock === 'boolean' ? r.manageStock : false);
  const rawStock = String(r.stockStatus ?? '').toLowerCase().trim();
  const stockStat: StockStatus =
    rawStock === 'instock' || rawStock === 'in_stock' || r.inStock === true
      ? 'in_stock'
      : rawStock === 'outofstock' || rawStock === 'out_of_stock'
        ? 'out_of_stock'
        : rawStock === 'onbackorder' || rawStock === 'on_backorder'
          ? 'on_backorder'
          : 'unknown';
  const stockQty = typeof r.stockQuantity === 'number'
    ? r.stockQuantity
    : (trackInventory && typeof r.inventoryQty === 'number'
        ? r.inventoryQty
        : (stockStat === 'in_stock' ? (trackInventory ? 0 : 50) : 0));
  // The store's own listing state, read as itself: a draft is a draft and stays
  // a draft through a save. Rows with no `status` come from the published-only
  // public read, where every row is live by construction — reading those as a
  // draft would unlist the whole console.
  const consoleStatus: CatalogStatus = r.status !== undefined
    ? (consoleStatusFromWoo(r.status) as CatalogStatus)
    : (r.isListed === false ? 'draft' : 'active');
  const isListed = consoleStatus === 'active';
  // No placeholder is invented here any more. Injecting
  // `/images/placeholder-product.svg` as a real entry made a product with no
  // images read as a product with one: the editor drew a single bogus image
  // card, the "at least one image is required" guard never fired, and the "no
  // images" list filter never matched. An empty list is the truth, and both
  // screens already render their own placeholder for it.

  const desc = (r.description as string) || (name ? `${name} — authentic pure Himalayan pink salt from the Himalayan Koh collection.` : '');
  const shortDesc = (r.shortDescription as string) || desc;
  // The console's own fields, as the store holds them. Absent means the store has
  // no value — and then the console's own default stands, exactly as it did
  // before these fields had anywhere to be saved. What must never happen again is
  // the other case: a value that *is* stored being replaced on screen by a
  // fabricated default, which is how a saved field read as a field that failed.
  const cf = asRecord(r.consoleFields);
  const storedFeatures = asTextList(cf.features);
  const storedSpecs = asRecord(cf.specifications);

  return {
    id,
    slug,
    name,
    shortTitle: asText(cf.shortTitle) ?? name,
    subtitle: asText(cf.subtitle) ?? catName,
    shortDescription: shortDesc,
    description: desc,
    features: storedFeatures ?? [],
    // The store's own columns (weight, dimensions) are authoritative where they
    // exist; the stored object is what carries the rest of what the Shipping tab
    // keeps (weight in ounces, the package preset it read).
    specifications: { ...storedSpecs, ...specifications },
    categoryId: catId,
    categoryName: catName,
    brand: asText(cf.brand) ?? 'Himalayan Koh',
    status: consoleStatus,
    price: priceNum,
    compareAtPrice: compareAt,
    costPrice: typeof r.costPrice === 'number' ? r.costPrice : 0,
    landedCost: typeof r.landedCost === 'number' ? r.landedCost : 0,
    marginPercent: 55,
    currency: asText(cf.currency) ?? 'USD',
    sku: (r.sku as string) || '',
    inventoryQty: stockQty,
    trackInventory,
    stockStatus: stockStat as CatalogProduct['stockStatus'],
    lowStockThreshold: typeof r.lowStockThreshold === 'number' ? r.lowStockThreshold : 5,
    shippingCost: asNum(cf.shippingCost) ?? 0,
    freeShipping: asBool(cf.freeShipping) ?? true,
    deliveryMinDays: asNum(cf.deliveryMinDays) ?? 2,
    deliveryMaxDays: asNum(cf.deliveryMaxDays) ?? 5,
    shippingNote: asText(cf.shippingNote) ?? undefined,
    usInventory: asBool(cf.usInventory) ?? true,
    supplierSource: asText(cf.supplierSource) ?? 'WooCommerce',
    supplierProductRef: asText(cf.supplierProductRef) ?? undefined,
    safetyClass: asText(cf.safetyClass) as CatalogProduct['safetyClass'],
    safetyReviewStatus: asText(cf.safetyReviewStatus) as CatalogProduct['safetyReviewStatus'],
    intendedSpecies: asText(cf.intendedSpecies) ?? 'Himalayan Pink Salt',
    commerceReadiness: (asText(cf.commerceReadiness) ?? 'COMMERCE_READY') as CatalogProduct['commerceReadiness'],
    sourceType: (asText(cf.sourceType) ?? 'MANUFACTURER_DIRECT') as CatalogProduct['sourceType'],
    inventorySource: (asText(cf.inventorySource) ?? 'INTERNAL_STOCK') as CatalogProduct['inventorySource'],
    fulfillmentMethod: asText(cf.fulfillmentMethod) ?? 'US_WAREHOUSE',
    supplierUrl: asText(cf.supplierUrl),
    supplierStockStatus: asText(cf.supplierStockStatus) ?? 'in_stock',
    riskFlags: asTextList(cf.riskFlags) ?? [],
    // Server-computed niche verdict, when the read that produced this row
    // carried one (the admin list/row reads do). Absent on the single-product
    // DTO, where the editor's checklist simply omits the niche line.
    isOffNiche: typeof r.isOffNiche === 'boolean'
      ? r.isOffNiche
      : typeof r.offNiche === 'boolean'
        ? r.offNiche
        : undefined,
    nicheApproved: asBool(cf.nicheApproved) ?? false,
    tags: parseTagList(r.tags),
    featured: !!r.featured,
    newArrival: asBool(cf.newArrival) ?? false,
    trending: asBool(cf.trending) ?? false,
    bestRated: asBool(cf.bestRated) ?? false,
    bestSeller: asBool(cf.bestSeller) ?? false,
    promoted: asBool(cf.promoted) ?? false,
    saleEnabled: asBool(cf.saleEnabled) ?? compareAt > priceNum,
    discountType: (asText(cf.discountType) ?? undefined) as CatalogProduct['discountType'],
    discountValue: asNum(cf.discountValue) ?? undefined,
    sortOrder: asNum(cf.sortOrder) ?? undefined,
    listingEndsAt: asText(cf.listingEndsAt),
    ogImage: asText(cf.ogImage) ?? undefined,
    ownerNotes: asText(cf.ownerNotes) ?? undefined,
    evidenceNotes: asText(cf.evidenceNotes) ?? undefined,
    seoTitle: typeof r.seoTitle === 'string' && r.seoTitle ? r.seoTitle : `${name} | Himalayan Koh`,
    seoDescription: typeof r.seoDescription === 'string' && r.seoDescription ? r.seoDescription : `${name} - Himalayan Koh product details.`,
    seoTitleStored: typeof r.seoTitle === 'string' && r.seoTitle ? r.seoTitle : null,
    seoDescriptionStored: typeof r.seoDescription === 'string' && r.seoDescription ? r.seoDescription : null,
    seoKeywords: Array.isArray(r.seoKeywords) ? r.seoKeywords.filter((x): x is string => typeof x === 'string') : [],
    canonicalSlug: typeof r.canonicalSlug === 'string' && r.canonicalSlug ? r.canonicalSlug : slug,
    seoContext: asRecord(cf.seoContext) as CatalogProduct['seoContext'],
    // The other half of what the product page shows: imagery this app ships
    // rather than the store's. Carried through read-only — see `CatalogProduct`.
    storefrontDefaultImages: Array.isArray(r.storefrontDefaultImages)
      ? (r.storefrontDefaultImages as unknown[]).map(String).filter(Boolean)
      : [],
    images: rawImgs.map((url, i) => ({
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
    // A row that is not live has never been published; dating it "now" is what
    // made a brand-new draft read as "First live: just now" in the product list.
    publishedAt: (r.publishedAt as string) || (isListed ? new Date().toISOString() : null),
  };
}

// ---------------------------------------------------------------------------
// Products — reads
// ---------------------------------------------------------------------------

/**
 * One screen routinely asks for the catalog twice: `listCategories()` derives its
 * list from `listProducts()`, and the products screen calls `listProducts()`
 * as well, so a single mount used to send two identical reads. Concurrent
 * callers now share the one in-flight request.
 */
const shareBrowserCatalogRead = singleFlight<CatalogProduct[]>();

let catalogMemoryCache: { products: CatalogProduct[]; timestamp: number } | null = null;
const CATALOG_CACHE_TTL_MS = 60_000;

export function invalidateCatalogCache(updatedProduct?: CatalogProduct | null, deletedId?: string | null) {
  if (!catalogMemoryCache) return;
  if (deletedId) {
    catalogMemoryCache.products = catalogMemoryCache.products.filter((p) => p.id !== deletedId);
    return;
  }
  if (updatedProduct) {
    const idx = catalogMemoryCache.products.findIndex((p) => p.id === updatedProduct.id);
    if (idx >= 0) {
      catalogMemoryCache.products[idx] = updatedProduct;
      return;
    }
  }
  catalogMemoryCache = null;
}

/** The browser read: the console's own route, which holds the credentials. */
async function readBrowserCatalog(): Promise<CatalogProduct[]> {
  try {
    const res = await fetch(`/api/admin/catalog?perPage=100&_t=${Date.now()}`, {
      headers: await adminHeaders(),
      cache: 'no-store',
    });
    if (res.ok) {
      const rows = parseAdminCatalogRows(await res.json());
      if (rows) return rows.map(catalogRowToProduct);
    }
    throw new Error(`the catalog read answered HTTP ${res.status}`);
  } catch (error) {
    throw new CatalogLoadError(error instanceof Error ? error.message : undefined);
  }
}

/** All products (any status) — the console's view of the store. */
export async function listProducts(forceFresh = false): Promise<CatalogProduct[]> {
  if (typeof window !== 'undefined') {
    if (!forceFresh && catalogMemoryCache && (Date.now() - catalogMemoryCache.timestamp < CATALOG_CACHE_TTL_MS)) {
      return catalogMemoryCache.products;
    }
    const res = await shareBrowserCatalogRead(() => readBrowserCatalog());
    catalogMemoryCache = { products: res, timestamp: Date.now() };
    return res;
  }

  // Server context (a server component, or a route calling this): read Woo
  // directly. Imported lazily so the Woo client and its credential reads can
  // never be pulled into a browser bundle through this module.
  const { readAdminCatalogPage } = await import(/* webpackIgnore: true */ '../../lib/backend/adminCatalog');
  const page = await readAdminCatalogPage({ perPage: 100 });
  const rows = (page as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(catalogRowToProduct);
}

export async function getProduct(id: string, forceFresh = false): Promise<CatalogProduct | null> {
  if (!forceFresh && typeof window !== 'undefined' && catalogMemoryCache && Date.now() - catalogMemoryCache.timestamp < CATALOG_CACHE_TTL_MS) {
    const found = catalogMemoryCache.products.find((p) => p.id === id || p.slug === id);
    if (found) return found;
  }

  if (isWooId(id)) {
    try {
      const json = await adminJson<{ product?: Record<string, unknown>; offNiche?: boolean }>(`/api/admin/products/${id}`);
      // `offNiche` rides beside the record on this route; fold it in so the
      // editor's readiness checklist can name the niche blocker.
      return json.product ? catalogRowToProduct({ ...json.product, offNiche: json.offNiche }) : null;
    } catch {
      return null;
    }
  }

  // A non-numeric id is a slug here: the store has no other kind of id.
  try {
    const all = await listProducts();
    return all.find((p) => p.id === id || p.slug === id) ?? null;
  } catch {
    return null;
  }
}

/**
 * Duplicate check without loading every product's images: the store's own
 * fields are matched, and only the store's products answer.
 */
export async function checkProductDuplicate(params: {
  url?: string | null;
  itemId?: string | null;
  title?: string;
  sku?: string | null;
}): Promise<{ id: string; name: string } | null> {
  const sku = (params.sku || '').trim().toLowerCase();
  const title = (params.title || '').trim().toLowerCase();
  if (!sku && !title) return null;
  try {
    const products = await listProducts();
    for (const p of products) {
      if (sku && p.sku.trim().toLowerCase() === sku) return { id: p.id, name: p.name };
      if (title && p.name.trim().toLowerCase() === title) return { id: p.id, name: p.name };
    }
  } catch {
    // An unreadable catalog cannot prove absence, so it reports nothing.
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Products — writes
// ---------------------------------------------------------------------------

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
  /** The owner's explicit storefront-niche approval, recorded on the product. */
  nicheApproved?: boolean;
  intendedSpecies?: string | null;
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
  /**
   * The product's whole image set, as public URLs.
   *
   * A full replacement, not a merge: the editor owns the gallery and sends what
   * it shows. Without this field on the console's write model the set never
   * reached the store at all — `toWooPatch` had no `images` mapping — so every
   * image add, removal, reorder and main-thumbnail change was a silent no-op on
   * the storefront, and a product created here had an empty gallery no matter
   * what the editor displayed.
   */
  images?: string[];
  ownerNotes?: string;
  evidenceNotes?: string;
  sortOrder?: number;
  listingEndsAt?: string | null;
}

/**
 * The console's status word → the store's. The table and its documented folds
 * live in one module (`lib/woo/productStatus.ts`) so the console, the API
 * boundary and the tests all translate identically — see that file for why a
 * draft used to come back from a save as WooCommerce `private`.
 */
function wooStatus(status: CatalogStatus): string {
  return wooListingStatusOrDraft(status);
}

/** Stock statuses as WooCommerce spells them. */
function wooStockStatus(status: string): string {
  if (status === 'out_of_stock') return 'outofstock';
  if (status === 'on_backorder') return 'onbackorder';
  return 'instock';
}

/**
 * The console's model → the store's patch.
 *
 * Only fields the caller actually supplied are sent, so a partial edit cannot
 * blank a field the form never showed. `specifications` is where the console
 * keeps weight and dimensions, so it unpacks into the store's own weight/
 * dimensions fields rather than being stored as a private blob.
 *
 * Two things keep this honest, because a silent drop here is invisible to the
 * route (the key never leaves the browser):
 *
 * 1. **Every console field is carried.** `CONSOLE_META_FIELDS` is walked, so a
 *    field the editor sends and this function does not map is a field nobody
 *    ever sees again — which is exactly what had happened to thirty-one of them.
 * 2. **Nothing else is accepted.** A key with no home throws before the request
 *    instead of leaving with a 200.
 */
function toWooPatch(input: Partial<ProductInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const mapped = new Set<string>();
  const set = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value;
  };

  // The console's own fields keep their names end to end: the editor sends
  // `supplierSource`, the API accepts `supplierSource`, the store keeps it under
  // `_himalayan_koh_supplier_source`. One table, no translation layer to forget.
  const consoleInput = input as Record<string, unknown>;
  for (const entry of CONSOLE_META_FIELDS) {
    mapped.add(entry.field);
    set(entry.field, consoleInput[entry.field]);
  }

  set('name', input.name);
  set('slug', input.canonicalSlug);
  set('description', input.description);
  set('shortDescription', input.shortDescription);
  set('sku', input.sku);
  set('price', input.price);
  set('compareAtPrice', input.compareAtPrice);
  set('costPrice', input.costPrice);
  set('landedCost', input.landedCost);
  if (input.images !== undefined) {
    const acceptable = wooImageSources(input.images);
    // Something was supplied and none of it is usable: say so rather than
    // write an empty gallery. `images: []` is a real instruction ("clear the
    // gallery"), and it must not be confused with "nothing I sent was usable".
    if (input.images.length > 0 && acceptable.length === 0) {
      throw new Error(
        'None of the attached image URLs are valid for WooCommerce. Add at least one valid image URL (JPEG, PNG, or WebP).',
      );
    }
    set('images', acceptable);
  }
  set('featured', input.featured);
  set('tags', input.tags);
  set('seoKeywords', input.seoKeywords);
  if (input.status !== undefined) set('status', wooStatus(input.status));
  // A category edit always names the whole category set (this catalogue keeps
  // one shelf per product), and `undefined` is the only value that means "leave
  // it alone". An explicit blank is the owner clearing the category — silently
  // dropping it reported "Category cleared" while the store still held the old
  // term — and a value that is not a term id is refused here rather than sent as
  // something WooCommerce cannot resolve (which is what a category *name* being
  // passed where an id belongs used to do, invisibly).
  if (input.categoryId !== undefined) {
    const raw: unknown = input.categoryId;
    const text = typeof raw === 'string' ? raw.trim() : raw;
    if (text === null || text === '') {
      set('categoryIds', []);
    } else {
      const numeric = Number(text);
      if (Number.isFinite(numeric) && numeric > 0) {
        set('categoryIds', [numeric]);
      } else {
        throw new Error(
          `"${String(raw)}" is not a category the store holds. Pick a category from the list — nothing was saved.`,
        );
      }
    }
  }
  if (input.specifications !== undefined) {
    const specs = asRecord(input.specifications);
    set('weight', specs.weightLbs);
    if (specs.lengthIn !== undefined || specs.widthIn !== undefined || specs.heightIn !== undefined) {
      body.dimensions = {
        length: typeof specs.lengthIn === 'number' ? specs.lengthIn : undefined,
        width: typeof specs.widthIn === 'number' ? specs.widthIn : undefined,
        height: typeof specs.heightIn === 'number' ? specs.heightIn : undefined,
      };
    }
    set('packagePreset', specs.packagePreset);
  }
  if (input.inventoryQty !== undefined || input.stockStatus !== undefined || input.lowStockThreshold !== undefined) {
    // Woo ignores stock_quantity unless manage_stock is on, and the console's
    // model says internal quantity is authoritative — so an inventory edit
    // enables stock management rather than silently doing nothing.
    set('manageStock', true);
    set('stockQuantity', input.inventoryQty ?? undefined);
    if (input.stockStatus !== undefined) set('stockStatus', wooStockStatus(input.stockStatus));
    set('lowStockAmount', input.lowStockThreshold);
  }
  if (input.seoTitle !== undefined || input.seoDescription !== undefined) {
    body.seo = {
      ...(input.seoTitle !== undefined ? { title: input.seoTitle } : {}),
      ...(input.seoDescription !== undefined ? { description: input.seoDescription } : {}),
    };
  }
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];

  // Console names that unpack into store fields rather than travelling as-is.
  for (const name of ['categoryId', 'inventoryQty', 'lowStockThreshold', 'seoTitle', 'seoDescription', 'canonicalSlug']) {
    mapped.add(name);
  }
  // A field with no home would vanish between here and the store, where the
  // route can no longer see it. Refuse the whole write instead: the caller's
  // error is loud, and nothing is reported as saved that was not.
  const unmapped = Object.entries(input)
    .filter(([key, value]) => value !== undefined && !mapped.has(key) && !(key in body))
    .map(([key]) => key);
  if (unmapped.length) {
    throw new Error(
      `${unmapped.join(', ')} cannot be stored on this product — nothing was saved.`,
    );
  }
  return body;
}

interface WooWriteAnswer {
  product?: Record<string, unknown>;
  /** Patch keys the store ignored, with Woo's reason. */
  ignored?: { field?: string; reason?: string }[];
}

/**
 * A key the store ignored is a save that did not happen.
 *
 * WooCommerce accepts a write and quietly drops fields it does not recognise, so
 * reporting success on the response alone is how the console ends up showing a
 * price the store never stored.
 */
function assertApplied(json: WooWriteAnswer): void {
  if (Array.isArray(json.ignored) && json.ignored.length > 0) {
    const details = json.ignored
      .map((item) => `${item.field || 'field'}: ${item.reason || 'not applied'}`)
      .join(' ');
    throw new Error(`WooCommerce did not apply this save. ${details}`);
  }
}

/** Save with the store's answer as the result: never a local echo. */
async function saveToWoo(id: string, patch: Record<string, unknown>): Promise<CatalogProduct | null> {
  if (!Object.keys(patch).length) return getProduct(id);
  const json = await adminJson<WooWriteAnswer>(`/api/admin/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  assertApplied(json);
  const updated = json.product ? catalogRowToProduct(json.product) : null;
  invalidateCatalogCache(updated);
  return updated ?? getProduct(id);
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<CatalogProduct | null> {
  if (!isWooId(id)) return null;
  return saveToWoo(id, toWooPatch(input));
}

export async function createProduct(input: ProductInput): Promise<CatalogProduct> {
  // A product is created as a DRAFT unless the caller asked otherwise, and the
  // console's `active` means published in the store.
  const body = { ...toWooPatch({ ...input, status: input.status ?? 'draft' }), type: 'simple' };
  const json = await adminJson<WooWriteAnswer>('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  assertApplied(json);
  if (!json.product) throw new Error('The store did not confirm the new product.');
  const created = catalogRowToProduct(json.product);
  invalidateCatalogCache();
  return created;
}

export async function setProductStatus(id: string, status: CatalogStatus): Promise<CatalogProduct | null> {
  if (!isWooId(id)) return null;
  return saveToWoo(id, { status: wooStatus(status) });
}

/** Archiving drafts the store's product; nothing is deleted. */
export async function archiveProduct(id: string): Promise<boolean> {
  if (!isWooId(id)) return false;
  try {
    return !!(await saveToWoo(id, { status: 'draft' }));
  } catch {
    return false;
  }
}

/** Hard delete — permanently removes the row and cleans up state. */
export async function hardDeleteProduct(id: string): Promise<void> {
  if (!isWooId(id)) return;
  await adminJson(`/api/admin/products/${id}?action=delete`, { method: 'DELETE' });
  invalidateCatalogCache(null, id);
}

/**
 * Copy a product, as a draft.
 *
 * The copy is the store's own: WooCommerce duplicates the record (description,
 * images, categories, tags, variation type) in one call, which is the only way
 * the copy can be trusted to match the original's kind.
 */
export async function duplicateProduct(id: string): Promise<CatalogProduct | null> {
  if (!isWooId(id)) return null;
  const json = await adminJson<WooWriteAnswer>(`/api/admin/products/${id}?action=duplicate`, {
    method: 'DELETE',
  });
  invalidateCatalogCache();
  return json.product ? catalogRowToProduct(json.product) : null;
}

// ---------------------------------------------------------------------------
// Images
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

export interface SaveRefsOptions {
  reload?: boolean;
}

/**
 * Replace a product's whole image set.
 *
 * WooCommerce rejects an entire save when one image URL is unacceptable, so
 * relative paths, SVGs and placeholder/badge assets are dropped before the
 * request — and if that leaves nothing where the caller had supplied something,
 * the save fails loudly rather than clearing the product's gallery.
 */
export async function saveProductImages(
  productId: string,
  images: CatalogImageInput[],
  opts: SaveRefsOptions = {},
): Promise<CatalogProduct | null> {
  if (!isWooId(productId)) return null;
  const validImages = wooImageSources(images.map((i) => i.url));
  if (validImages.length === 0 && images.length > 0) {
    throw new Error('None of the attached image URLs are valid for WooCommerce. Add at least one valid image URL (JPEG, PNG, or WebP).');
  }
  const updated = await saveToWoo(productId, { images: validImages });
  return opts.reload === false ? null : (updated ?? getProduct(productId));
}

// ---------------------------------------------------------------------------
// Variants
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
 * The variants this console cannot ask the store to save: the ones it does not
 * have.
 *
 * Creating a variation means creating its attribute set on the parent too, and a
 * console that invents an option produces a variation no customer can select.
 * So they are skipped — but they are *reported* (see the editor's save notice),
 * because a skip nobody mentions is how a variant the owner typed looked saved.
 */
export function unsavableVariants(variants: CatalogVariantInput[]): CatalogVariantInput[] {
  return variants.filter((v) => !v.id || !isWooId(v.id));
}

/**
 * Apply variation edits to an existing variable product.
 *
 * Every field the Variants tab shows is mapped, including the compare-at price
 * (the "Sale" column, which used to be dropped here without a word) and the
 * supplier cost, which the store keeps as variation meta.
 */
export async function saveProductVariants(
  productId: string,
  variants: CatalogVariantInput[],
  opts: SaveRefsOptions = {},
): Promise<CatalogProduct | null> {
  if (!isWooId(productId)) return null;
  const wooVariations = variants
    .filter((v) => v.id && isWooId(v.id))
    .map((v) => ({
      id: Number(v.id),
      ...variationPriceFields({ price: v.price ?? null, compareAtPrice: v.compareAtPrice ?? null }),
      sku: v.sku || undefined,
      manageStock: v.inventoryQty !== undefined,
      stockQuantity: v.inventoryQty,
      stockStatus: v.status === 'inactive' ? 'outofstock' : 'instock',
      costPrice: v.costPrice ?? undefined,
      lowStockAmount: v.lowStockThreshold ?? undefined,
    }));
  if (wooVariations.length > 0) {
    await saveToWoo(productId, { variations: wooVariations });
  }
  return opts.reload === false ? null : getProduct(productId);
}

// ---------------------------------------------------------------------------
// Categories — WooCommerce product categories
// ---------------------------------------------------------------------------

interface WooCategoryRecord {
  id: number;
  name: string;
  slug: string;
  description?: string;
  count?: number;
}

function wooCategoryToCatalog(c: WooCategoryRecord, index: number): CatalogCategory {
  return {
    id: String(c.id),
    name: c.name,
    slug: c.slug || String(c.id),
    description: c.description || undefined,
    isActive: true,
    sortOrder: index + 1,
  };
}

export async function listCategories(): Promise<CatalogCategory[]> {
  if (typeof window === 'undefined') {
    // Server context: the store's own taxonomy, read with credentials.
    const { listWooCategories } = await import('../../lib/woo/taxonomyWrite');
    return (await listWooCategories()).map(wooCategoryToCatalog);
  }
  const json = await adminJson<{ categories?: WooCategoryRecord[] }>('/api/admin/categories');
  return (json.categories ?? []).map(wooCategoryToCatalog);
}

export async function createCategory(input: { name: string; isActive?: boolean }): Promise<CatalogCategory> {
  const json = await adminJson<{ category?: WooCategoryRecord }>('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify({ name: input.name.trim() }),
  });
  if (!json.category) throw new Error('The store did not confirm the new category.');
  return wooCategoryToCatalog(json.category, 0);
}

export async function updateCategory(
  id: string,
  patch: { name?: string; isActive?: boolean },
): Promise<CatalogCategory | null> {
  if (!isWooId(id)) return null;
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (!Object.keys(body).length) return null;
  const json = await adminJson<{ category?: WooCategoryRecord }>(`/api/admin/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return json.category ? wooCategoryToCatalog(json.category, 0) : null;
}

/** Deleting a term that still holds products is refused — by the store, not here. */
export async function deleteCategory(id: string): Promise<void> {
  if (!isWooId(id)) return;
  await adminJson(`/api/admin/categories/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Coupons — WooCommerce coupons
// ---------------------------------------------------------------------------

interface WooCouponLike {
  id: number;
  code: string;
  amount: string;
  discount_type: string;
  description?: string;
  date_created_gmt?: string;
  date_expires_gmt?: string | null;
  usage_count?: number;
  usage_limit?: number | null;
  minimum_amount?: string;
  product_ids?: number[];
  status?: string;
  state?: 'active' | 'scheduled' | 'expired' | 'draft';
}

function wooCouponToCoupon(c: WooCouponLike): Coupon {
  const amount = Number(c.amount);
  return {
    id: String(c.id),
    code: c.code,
    description: c.description || undefined,
    discountType: c.discount_type === 'percent' ? 'percent' : 'fixed',
    discountValue: Number.isFinite(amount) ? amount : 0,
    minCartValue: Number(c.minimum_amount) || 0,
    // Woo's coupon model carries no category eligibility, so none is claimed.
    eligibleProductIds: (c.product_ids ?? []).map(String),
    eligibleCategoryIds: [],
    startAt: c.date_created_gmt || null,
    endAt: c.date_expires_gmt || null,
    usageLimit: c.usage_limit ?? null,
    usedCount: c.usage_count ?? 0,
    isActive: (c.state ?? (c.status === 'publish' ? 'active' : 'draft')) === 'active',
    createdAt: c.date_created_gmt || '',
    updatedAt: c.date_created_gmt || '',
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  const json = await adminJson<{ coupons?: WooCouponLike[] }>('/api/admin/coupons');
  return (json.coupons ?? []).map(wooCouponToCoupon).sort((a, b) => a.code.localeCompare(b.code));
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

function toWooCouponBody(input: CouponInput): Record<string, unknown> {
  return {
    code: input.code.trim().toUpperCase(),
    discountType: input.discountType === 'percent' ? 'percent' : 'fixed_cart',
    amount: input.discountValue,
    description: input.description,
    dateExpires: input.endAt || null,
    minimumAmount: input.minCartValue ?? null,
    usageLimit: input.usageLimit ?? null,
    ...(input.eligibleProductIds?.length
      ? { productIds: input.eligibleProductIds.map(Number).filter((n) => Number.isFinite(n) && n > 0) }
      : {}),
    published: input.isActive !== false,
  };
}

export async function createCoupon(input: CouponInput): Promise<Coupon> {
  const json = await adminJson<{ coupon?: WooCouponLike }>('/api/admin/coupons', {
    method: 'POST',
    body: JSON.stringify(toWooCouponBody(input)),
  });
  if (!json.coupon) throw new Error('The store did not confirm the new coupon.');
  return wooCouponToCoupon(json.coupon);
}

export async function updateCoupon(id: string, input: CouponInput): Promise<Coupon | null> {
  if (!isWooId(id)) return null;
  const json = await adminJson<{ coupon?: WooCouponLike }>(`/api/admin/coupons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toWooCouponBody(input)),
  });
  return json.coupon ? wooCouponToCoupon(json.coupon) : null;
}

export async function deleteCoupon(id: string): Promise<void> {
  if (!isWooId(id)) return;
  await adminJson(`/api/admin/coupons/${id}?force=true`, { method: 'DELETE' });
}

export interface CouponValidation {
  ok: boolean;
  message?: string;
  discount: number;
  coupon?: Coupon;
}

/** Coupon eligibility, as a pure function — no store call, so it can be tested. */
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
  const discount = coupon.discountType === 'percent'
    ? Math.round(subtotal * (coupon.discountValue / 100) * 100) / 100
    : Math.min(subtotal, coupon.discountValue);
  return { ok: true, discount, coupon };
}

// ---------------------------------------------------------------------------
// Store offers
//
// Not commerce: a storefront campaign the owner stages in the console. It lives
// in the plugin's record store (services/db.ts), which is the console's own
// state and never the store's.
// ---------------------------------------------------------------------------

interface OfferRow {
  id: string;
  name: string;
  offerType?: string;
  value?: number | null;
  productIds?: unknown;
  categoryIds?: unknown;
  isActive?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  createdAt?: string;
  [k: string]: unknown;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export async function listOffers(): Promise<StoreOffer[]> {
  const rows = (await getDb().list<OfferRow>('store_offers')) || [];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    offerType: (r.offerType as StoreOffer['offerType']) || 'percentage',
    value: typeof r.value === 'number' ? r.value : null,
    productIds: strArr(r.productIds),
    categoryIds: strArr(r.categoryIds),
    isActive: r.isActive !== false,
    startAt: r.startAt || null,
    endAt: r.endAt || null,
    createdAt: r.createdAt || '',
  }));
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

function offerRow(id: string, input: OfferInput): OfferRow {
  return {
    id,
    name: input.name,
    offerType: input.offerType,
    value: input.value ?? null,
    productIds: input.productIds ?? [],
    categoryIds: input.categoryIds ?? [],
    isActive: input.isActive ?? true,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    createdAt: new Date().toISOString(),
  };
}

export async function createOffer(input: OfferInput): Promise<StoreOffer> {
  const id = uid();
  await getDb().insertRaw('store_offers', offerRow(id, input));
  return (await listOffers()).find((o) => o.id === id)!;
}

export async function updateOffer(id: string, input: OfferInput): Promise<StoreOffer | null> {
  const row = await getDb().updateBy<OfferRow>('store_offers', 'id', id, offerRow(id, input));
  if (!row) return null;
  return (await listOffers()).find((o) => o.id === id) ?? null;
}

export async function deleteOffer(id: string): Promise<void> {
  await getDb().remove('store_offers', id);
}

// ---------------------------------------------------------------------------
// Store settings (free-shipping strategy etc.)
//
// The console's own key in its record store. The storefront reads the published
// policy from here, which is why the default in `types.ts` mirrors it.
// ---------------------------------------------------------------------------

const FREE_SHIPPING_KEY = 'free_shipping';

export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    const row = await getDb().findFirst<{ key: string; value?: unknown }>('store_settings', 'key', FREE_SHIPPING_KEY);
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
  const db: DbAdapter = getDb();
  const now = new Date().toISOString();
  const existing = await db.findFirst<{ key: string }>('store_settings', 'key', FREE_SHIPPING_KEY).catch(() => null);
  if (existing) {
    await db.updateBy('store_settings', 'key', FREE_SHIPPING_KEY, { value: settings, updatedAt: now });
  } else {
    await db.insertRaw('store_settings', { key: FREE_SHIPPING_KEY, value: settings, createdAt: now, updatedAt: now });
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
  const allProductsFree = cart.length > 0 && cart.every((c) => c.productFreeShipping);
  const freeEligible = allProductsFree || (settings.freeShippingEnabled && subtotal >= settings.freeShippingThreshold);
  return {
    enabled: settings.freeShippingEnabled,
    threshold: settings.freeShippingThreshold,
    freeEligible,
    standardCost: 4.99,
  };
}
