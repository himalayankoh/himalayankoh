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
  CatalogStatus,
} from './types';
import { parseTagList } from './tags';

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
    throw new Error(body.error || `${path} answered HTTP ${response.status}.`);
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
  const rawImgs = (Array.isArray(r.images) && r.images.length > 0
    ? (r.images as string[])
    : (r.image ? [String(r.image)] : [])
  ).map((s) => String(s || '').trim()).filter(Boolean);
  const name = String(r.name || 'Untitled Product');
  const id = String(r.id);
  const slug = String(r.slug || id);
  const catName = (r.categoryName as string) || (r.category as string) || 'Uncategorized';
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
  const catId = typeof r.categoryId === 'number' || typeof r.categoryId === 'string'
    ? String(r.categoryId)
    : `cat-${catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const stockQty = typeof r.stockQuantity === 'number' ? r.stockQuantity : (r.stockStatus === 'instock' || r.inStock ? 50 : 0);
  const stockStat = r.stockStatus === 'instock' || r.inStock
    ? 'in_stock'
    : r.stockStatus === 'outofstock'
      ? 'out_of_stock'
      : r.stockStatus === 'onbackorder'
        ? 'on_backorder'
        : 'unknown';
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
    tags: parseTagList(r.tags),
    featured: !!r.featured,
    newArrival: false,
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

/** The browser read: the console's own route, which holds the credentials. */
async function readBrowserCatalog(): Promise<CatalogProduct[]> {
  try {
    const res = await fetch('/api/admin/catalog?perPage=100', { headers: await adminHeaders() });
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
  const { readAdminCatalogPage } = await import('../../lib/backend/adminCatalog');
  const page = await readAdminCatalogPage({ perPage: 100 });
  const rows = (page as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(catalogRowToProduct);
}

export async function getProduct(id: string): Promise<CatalogProduct | null> {
  if (typeof window !== 'undefined' && catalogMemoryCache && Date.now() - catalogMemoryCache.timestamp < CATALOG_CACHE_TTL_MS) {
    const found = catalogMemoryCache.products.find((p) => p.id === id || p.slug === id);
    if (found) return found;
  }

  if (isWooId(id)) {
    try {
      const json = await adminJson<{ product?: Record<string, unknown> }>(`/api/admin/products/${id}`);
      return json.product ? catalogRowToProduct(json.product) : null;
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
  ownerNotes?: string;
  evidenceNotes?: string;
  sortOrder?: number;
  listingEndsAt?: string | null;
}

const WOO_STATUS_BY_LOCAL: Record<string, string> = {
  active: 'publish',
  inactive: 'private',
  archived: 'draft',
  ready: 'draft',
  draft: 'draft',
};

function wooStatus(status: CatalogStatus): string {
  return WOO_STATUS_BY_LOCAL[status] ?? 'draft';
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
 */
function toWooPatch(input: Partial<ProductInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value;
  };

  set('name', input.name);
  set('slug', input.canonicalSlug);
  set('description', input.description);
  set('shortDescription', input.shortDescription);
  set('sku', input.sku);
  set('price', input.price);
  set('compareAtPrice', input.compareAtPrice);
  set('costPrice', input.costPrice);
  set('landedCost', input.landedCost);
  set('featured', input.featured);
  set('tags', input.tags);
  set('seoKeywords', input.seoKeywords);
  if (input.status !== undefined) set('status', wooStatus(input.status));
  if (input.categoryId) {
    const numeric = Number(input.categoryId);
    if (Number.isFinite(numeric) && numeric > 0) set('categoryIds', [numeric]);
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

/** Trash (not delete) — the console's bin, the store's own recycle path. */
export async function hardDeleteProduct(id: string): Promise<void> {
  if (!isWooId(id)) return;
  await adminJson(`/api/admin/products/${id}?action=trash`, { method: 'DELETE' });
  invalidateCatalogCache();
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
  const validImages = images
    .map((i) => i.url)
    .filter((url) => {
      if (!url || !/^https?:\/\//i.test(url)) return false;
      if (/\.svg(\?|$)/i.test(url)) return false;
      if (/(placeholder|favicon|icon|badge|sprite|loader|spinner|pixel)/i.test(url)) return false;
      return true;
    });
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
 * Apply variation edits to an existing variable product.
 *
 * Only variations the store already knows (numeric ids) are sent: creating a
 * variation means creating its attribute set too, and inventing one here would
 * produce variations no customer could select.
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
      regularPrice: v.price != null ? String(v.price) : undefined,
      sku: v.sku || undefined,
      manageStock: v.inventoryQty !== undefined,
      stockQuantity: v.inventoryQty,
      stockStatus: v.status === 'inactive' ? 'outofstock' : 'instock',
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
