/**
 * The mapping between the admin product editor and WooCommerce REST v3.
 *
 * Pure, so both directions can be pinned in a test without a live store — and
 * so the API route, the write module and the storefront cannot each grow their
 * own opinion of what a "price" or a "stock status" is.
 *
 * ## Two rules this file exists to enforce
 *
 * 1. **Undefined means untouched.** The admin sends partial updates (toggling a
 *    product to draft, flipping featured). A mapper that filled blanks with
 *    `''` would clear the description every time somebody flipped a switch, so
 *    a key is emitted only when the caller actually supplied it.
 * 2. **Absence is not zero.** Woo reports price and stock as empty strings and
 *    `null`s rather than omissions, and a `0` price is a real price. Every
 *    reader below returns `null` for "not reported" and never defaults.
 *
 * ## Where price and stock actually live
 *
 * On this catalog almost every product is *variable*: the parent carries an
 * empty `regular_price` and the real numbers sit on the variations. That is not
 * a detail to smooth over — reporting the parent's empty price as "the price"
 * is how the storefront ended up saying "Price unavailable" for products that
 * are priced, and writing a price to a variable parent is a silent no-op in
 * WooCommerce. So the reader returns both the parent's own values *and* the
 * variation range, and the writer refuses to pretend a parent-level price edit
 * on a variable product did anything.
 */

import { curatedProductImages } from '../products/curatedImages';

/** Stock status as WooCommerce reports and accepts it. */
export type WooStockStatus = 'instock' | 'outofstock' | 'onbackorder';

/** Product status as WooCommerce reports and accepts it. */
export type WooProductStatus = 'publish' | 'draft' | 'pending' | 'private';

/** A product patch, coming from the admin editor or an inline row action. */
export interface AdminProductPatch extends ConsoleProductFields {
  /** Product title. */
  name?: string;
  slug?: string;
  /** Listing state. `isListed: false` maps to `draft`, not to deletion. */
  status?: WooProductStatus;
  description?: string;
  shortDescription?: string;
  sku?: string;
  /**
   * The price the customer pays. A numeric string is accepted and coerced —
   * see `toPriceNumber` — because a form field produces one and silently
   * dropping it would leave the store unchanged while reporting success.
   */
  price?: number | string | null;
  /** The struck-through "was" price. Accepts a numeric string, as `price` does. */
  compareAtPrice?: number | string | null;
  categoryIds?: number[];
  tags?: string[];
  /** Public image URLs or image objects. Woo resolves an existing media item or sideloads. */
  images?: Array<string | { src?: string; alt?: string; id?: number; name?: string }>;
  type?: 'simple' | 'variable';
  manageStock?: boolean;
  stockQuantity?: number | null;
  stockStatus?: WooStockStatus;
  backorders?: 'no' | 'notify' | 'yes';
  lowStockAmount?: number | null;
  weight?: number | null;
  dimensions?: { length?: number | null; width?: number | null; height?: number | null };
  /** Admin economics stored as explicit Himalayan Koh metadata. */
  costPrice?: number | null;
  landedCost?: number | null;
  packagePreset?: string | null;
  seoKeywords?: string[];
  canonicalSlug?: string | null;
  featured?: boolean;
  /** SEO fields, written to the store's SEO plugin (Yoast) keys. */
  seo?: { title?: string | null; description?: string | null };
}

/** A variation patch. Prices and stock for variable products live here. */
export interface AdminVariationPatch {
  regularPrice?: number | null;
  salePrice?: number | null;
  sku?: string;
  manageStock?: boolean;
  stockQuantity?: number | null;
  stockStatus?: WooStockStatus;
  /** Supplier cost, stored as `meta_data` on the variation. */
  costPrice?: number | null;
  /** The store's own low-stock warning level for this variation. */
  lowStockAmount?: number | null;
}

/**
 * The fields a variation write may carry.
 *
 * Short on purpose: a variation's *attributes* are not here. Its option set has
 * to be one the parent product declares as a variation attribute, and this
 * console cannot create those — so an attribute it invented would be dropped by
 * the store, which is the silence this list exists to end. A caller that sends
 * one is told (see `unsupportedVariationWriteFields`) rather than left believing
 * a customer can now choose that option.
 */
export const VARIATION_WRITE_FIELDS: readonly string[] = [
  'regularPrice',
  'salePrice',
  'sku',
  'manageStock',
  'stockQuantity',
  'stockStatus',
  'costPrice',
  'lowStockAmount',
  // `id` addresses the variation and is read before the patch is applied.
  'id',
];

/** Variation keys a write cannot carry, in the caller's own words. */
export function unsupportedVariationWriteFields(
  patch: Record<string, unknown>,
): Array<{ field: string; reason: string }> {
  return Object.keys(patch)
    .filter((key) => !VARIATION_WRITE_FIELDS.includes(key))
    .map((field) => ({
      field,
      reason: 'This console has no variation field for it on the store, so it was not saved.',
    }));
}

/**
 * The regular/sale pair a variation's console fields describe.
 *
 * The same rule as a product's own price (`priceFields`), applied to a variation
 * instead of the parent: the console's `price` is what the customer pays and its
 * `compareAtPrice` is the struck-through "was", while WooCommerce stores a list
 * price and a discounted price. A compare-at decides the pair on its own, and a
 * price edit clears any sale the variation was still carrying — otherwise the
 * store goes on charging the old discounted number while the console shows the
 * new one.
 */
export function variationPriceFields(patch: {
  price?: number | null;
  compareAtPrice?: number | null;
}): { regularPrice?: number | null; salePrice?: number | null } {
  const price = toPriceNumber(patch.price);
  const compareAt = toPriceNumber(patch.compareAtPrice);

  if (patch.compareAtPrice !== undefined) {
    if (compareAt === null || compareAt === undefined || compareAt <= 0 || price === null || price === undefined) {
      return { regularPrice: price ?? null, salePrice: null };
    }
    return { regularPrice: compareAt, salePrice: price };
  }
  if (patch.price !== undefined) {
    return { regularPrice: price ?? null, salePrice: null };
  }
  return {};
}

/** The `meta_data` keys the store's SEO plugin reads (Yoast is the installed one). */
export const SEO_META_KEYS = {
  title: '_yoast_wpseo_title',
  description: '_yoast_wpseo_metadesc',
  keywords: '_himalayan_koh_seo_keywords',
  canonicalSlug: '_himalayan_koh_canonical_slug',
  costPrice: '_himalayan_koh_cost_price',
  landedCost: '_himalayan_koh_landed_cost',
  packagePreset: '_himalayan_koh_package_preset',
} as const;

/* ------------------------------------------------------------------ */
/* The console's own product fields                                    */
/* ------------------------------------------------------------------ */

/**
 * The product fields the console owns that WooCommerce has no column for.
 *
 * Why this table exists: the editor writes about fifty fields, and only a
 * handful of them are WooCommerce columns. Everything else — the supplier trail,
 * the shipping policy, the merchandising flags, the copy the console's own
 * screens show — used to travel to `/api/admin/products` and be dropped there
 * without a word, so the owner edited a field, saw "Saved", and found the old
 * value on the next read. A field with no home is now either stored here or
 * reported; `CONSOLE_META_FIELDS` is that home.
 *
 * They are written as `meta_data` on the store's own product, next to the
 * economics this app already stores that way (`SEO_META_KEYS`), because that is
 * the only place a WooCommerce product can keep them and it is where the store's
 * own admin screens can see them. Key names are stable: an owner who has a value
 * under `_himalayan_koh_supplier_source` keeps it.
 */
export type ConsoleFieldKind = 'string' | 'number' | 'boolean' | 'stringList' | 'json';

export interface ConsoleMetaField {
  /** The console's name for the field — the API body's key, unchanged. */
  field: string;
  /** The `meta_data` key the value is stored under. */
  key: string;
  kind: ConsoleFieldKind;
}

export const CONSOLE_META_FIELDS: readonly ConsoleMetaField[] = [
  { field: 'shortTitle', key: '_himalayan_koh_short_title', kind: 'string' },
  { field: 'subtitle', key: '_himalayan_koh_subtitle', kind: 'string' },
  { field: 'brand', key: '_himalayan_koh_brand', kind: 'string' },
  { field: 'currency', key: '_himalayan_koh_currency', kind: 'string' },
  { field: 'features', key: '_himalayan_koh_features', kind: 'stringList' },
  { field: 'specifications', key: '_himalayan_koh_specifications', kind: 'json' },
  { field: 'shippingCost', key: '_himalayan_koh_shipping_cost', kind: 'number' },
  { field: 'freeShipping', key: '_himalayan_koh_free_shipping', kind: 'boolean' },
  { field: 'deliveryMinDays', key: '_himalayan_koh_delivery_min_days', kind: 'number' },
  { field: 'deliveryMaxDays', key: '_himalayan_koh_delivery_max_days', kind: 'number' },
  { field: 'shippingNote', key: '_himalayan_koh_shipping_note', kind: 'string' },
  { field: 'usInventory', key: '_himalayan_koh_us_inventory', kind: 'boolean' },
  { field: 'supplierSource', key: '_himalayan_koh_supplier_source', kind: 'string' },
  { field: 'supplierProductRef', key: '_himalayan_koh_supplier_ref', kind: 'string' },
  { field: 'supplierUrl', key: '_himalayan_koh_supplier_url', kind: 'string' },
  { field: 'supplierStockStatus', key: '_himalayan_koh_supplier_stock_status', kind: 'string' },
  { field: 'commerceReadiness', key: '_himalayan_koh_commerce_readiness', kind: 'string' },
  { field: 'sourceType', key: '_himalayan_koh_source_type', kind: 'string' },
  { field: 'inventorySource', key: '_himalayan_koh_inventory_source', kind: 'string' },
  { field: 'fulfillmentMethod', key: '_himalayan_koh_fulfillment_method', kind: 'string' },
  { field: 'intendedSpecies', key: '_himalayan_koh_intended_species', kind: 'string' },
  { field: 'safetyClass', key: '_himalayan_koh_safety_class', kind: 'string' },
  { field: 'safetyReviewStatus', key: '_himalayan_koh_safety_review_status', kind: 'string' },
  { field: 'riskFlags', key: '_himalayan_koh_risk_flags', kind: 'stringList' },
  { field: 'nicheApproved', key: '_himalayan_koh_niche_approved', kind: 'boolean' },
  { field: 'newArrival', key: '_himalayan_koh_new_arrival', kind: 'boolean' },
  { field: 'trending', key: '_himalayan_koh_trending', kind: 'boolean' },
  { field: 'bestRated', key: '_himalayan_koh_best_rated', kind: 'boolean' },
  { field: 'bestSeller', key: '_himalayan_koh_best_seller', kind: 'boolean' },
  { field: 'promoted', key: '_himalayan_koh_promoted', kind: 'boolean' },
  { field: 'saleEnabled', key: '_himalayan_koh_sale_enabled', kind: 'boolean' },
  { field: 'discountType', key: '_himalayan_koh_discount_type', kind: 'string' },
  { field: 'discountValue', key: '_himalayan_koh_discount_value', kind: 'number' },
  { field: 'sortOrder', key: '_himalayan_koh_sort_order', kind: 'number' },
  { field: 'listingEndsAt', key: '_himalayan_koh_listing_ends_at', kind: 'string' },
  { field: 'ogImage', key: '_himalayan_koh_og_image', kind: 'string' },
  { field: 'ownerNotes', key: '_himalayan_koh_owner_notes', kind: 'string' },
  { field: 'evidenceNotes', key: '_himalayan_koh_evidence_notes', kind: 'string' },
  { field: 'seoContext', key: '_himalayan_koh_seo_context', kind: 'json' },
];

/**
 * The fields a product write may carry.
 *
 * One list, used by both admin routes as their allowlist, by the client before
 * it sends anything, and by the report that names a key nobody can store. It
 * used to be two hand-written arrays inside two route files while the mapper in
 * `features/catalog/repository.ts` had a third opinion — which is exactly how a
 * field ended up being sent, accepted, mapped by nobody and dropped in silence.
 */
export const PRODUCT_PATCH_FIELDS = [
  'name',
  'slug',
  'status',
  'description',
  'shortDescription',
  'sku',
  'price',
  'compareAtPrice',
  'categoryIds',
  'tags',
  'images',
  'type',
  'manageStock',
  'stockQuantity',
  'stockStatus',
  'backorders',
  'lowStockAmount',
  'weight',
  'dimensions',
  'costPrice',
  'landedCost',
  'packagePreset',
  'seoKeywords',
  'canonicalSlug',
  'featured',
  'seo',
] as const;

/** WooCommerce columns plus the console's own meta fields. See the table above. */
export const PRODUCT_WRITE_FIELDS: readonly string[] = [
  ...PRODUCT_PATCH_FIELDS,
  ...CONSOLE_META_FIELDS.map((entry) => entry.field),
];

/**
 * Body keys a product write cannot carry, in the caller's own words.
 *
 * Used to answer with `ignored` instead of a bare 200, so a caller — the
 * console today, an integration tomorrow — is told which of its fields the
 * store was never given, rather than reading success into a save that dropped
 * half of them.
 */
export function unsupportedProductWriteFields(
  body: Record<string, unknown>,
  alsoAllowed: readonly string[] = [],
): Array<{ field: string; reason: string }> {
  const allowed = new Set<string>([...PRODUCT_WRITE_FIELDS, ...alsoAllowed]);
  return Object.keys(body)
    .filter((key) => !allowed.has(key))
    .map((field) => ({
      field,
      reason: 'This console has no field for it on the store, so it was not saved.',
    }));
}

/** Serialises one console field for `meta_data`. Empty/null clears the meta. */
export function toConsoleMetaValue(kind: ConsoleFieldKind, value: unknown): string {
  switch (kind) {
    case 'boolean':
      return value === true ? 'yes' : 'no';
    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(value);
      return value === null || value === undefined || !Number.isFinite(parsed) ? '' : String(parsed);
    }
    case 'stringList':
      return JSON.stringify(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
    case 'json':
      try {
        return JSON.stringify(value ?? {});
      } catch {
        return '';
      }
    default:
      return value === null || value === undefined ? '' : String(value).trim();
  }
}

/** Reads one console field back. `null` means "the store holds no value". */
export function fromConsoleMetaValue(kind: ConsoleFieldKind, raw: string | null): unknown {
  if (raw === null) return null;
  switch (kind) {
    case 'boolean':
      return raw === 'yes' || raw === 'true' || raw === '1';
    case 'number': {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    case 'stringList': {
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      } catch {
        return [];
      }
    }
    case 'json': {
      try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    default:
      return raw.trim() || null;
  }
}

function metaValue(row: WooProductLike, key: string): string | null {
  const entry = row.meta_data?.find((item) => item.key === key);
  if (!entry || entry.value === undefined || entry.value === null) return null;
  const value = String(entry.value).trim();
  return value || null;
}

function numberMetaValue(row: WooProductLike, key: string): number | null {
  const value = metaValue(row, key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringListMetaValue(row: WooProductLike, key: string): string[] {
  const value = metaValue(row, key);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

/** Serialises a number for Woo, which expects decimal strings. `null` clears. */
export function toWooDecimal(value: number | null | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return '';
  if (!Number.isFinite(value)) return undefined;
  return value.toFixed(2);
}

/** Reads a Woo decimal string. Empty, absent and non-numeric all mean "not reported". */
export function parseWooDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The regular/sale pair a patch describes.
 *
 * WooCommerce's two price fields mean "list price" and "discounted price",
 * while the admin editor's `price` / `compareAtPrice` mean "what you pay" and
 * "what it used to cost". Translating them the other way round — writing
 * `price` into `regular_price` while a compare-at exists — advertises the
 * discounted number as the normal one and shows the higher number as a saving
 * that never existed.
 *
 * A compare-at price is the only thing that makes a product "on sale", so it
 * decides the pair on its own; `price` alone is the whole price story — the
 * product sells at exactly that number, which means any *existing* `sale_price`
 * has to go. Leaving it stood would keep the store charging the old number while
 * the console displayed the new one, because WooCommerce charges `sale_price`
 * whenever it is set. A null price clears both fields.
 */
/**
 * A price as a number, accepting the numeric string a form field produces.
 *
 * `toWooDecimal` is deliberately strict — it takes a number and returns
 * `undefined` for anything else — and this is the one place that relaxes it.
 * The admin editor sends numbers, but a price arriving as `"2.50"` (a form
 * value, a hand-written API call) used to fall through that strictness into
 * `regular_price: undefined`, which JSON drops: the response said 200, the
 * store was unchanged, and nothing reported a problem. A silent no-op on the
 * price is the worst outcome available here, so a supplied price is coerced
 * when it is numeric and rejected when it is not.
 */
export function toPriceNumber(value: number | string | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const raw = value.trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** True when a price was supplied but cannot be read as a number. */
export function isUnusablePrice(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return toPriceNumber(value as number | string) === undefined;
}

export function priceFields(
  patch: Pick<AdminProductPatch, 'price' | 'compareAtPrice'>
): { regular_price?: string; sale_price?: string } {
  const price = toPriceNumber(patch.price);
  const compareAt = toPriceNumber(patch.compareAtPrice);

  if (patch.compareAtPrice !== undefined) {
    if (compareAt === null || compareAt === undefined) {
      return { regular_price: toWooDecimal(price ?? null), sale_price: '' };
    }
    return {
      regular_price: toWooDecimal(compareAt),
      sale_price: toWooDecimal(price ?? null),
    };
  }

  if (patch.price !== undefined) {
    // Clearing `sale_price` here is not tidiness. On update, this branch names a
    // price for a product that may already be discounted: writing only
    // `regular_price` left the old `sale_price` in place, WooCommerce went on
    // charging it, and `sellingPrice` reported the *sale* price back — so the
    // console showed the old number as though the edit had been refused, and the
    // storefront kept selling it. `regular_price` alone is the whole price story
    // only when nothing is on sale.
    return price === null || price === undefined
      ? { regular_price: '', sale_price: '' }
      : { regular_price: toWooDecimal(price), sale_price: '' };
  }

  return {};
}

/**
 * The reverse: what the customer pays and what the "was" price is.
 *
 * A Woo product is only on sale when `sale_price` is set, so that — not the
 * presence of a higher regular price — is what puts a compare-at on the record.
 */
export function sellingPrice(row: {
  regular_price?: string;
  sale_price?: string;
}): { price: number | null; compareAtPrice: number | null } {
  const regular = parseWooDecimal(row.regular_price);
  const sale = parseWooDecimal(row.sale_price);
  if (sale !== null && sale > 0) return { price: sale, compareAtPrice: regular };
  return { price: regular, compareAtPrice: null };
}

/**
 * Builds the body for `POST /wc/v3/products` or `PUT /wc/v3/products/<id>`.
 *
 * Only keys the caller supplied appear in the result.
 */
/**
 * What WooCommerce will actually accept as a product image source.
 *
 * WooCommerce rejects the *whole* product write when one entry is unusable, so
 * the sources the store cannot sideload are removed before the request:
 * relative paths (the storefront's app-shipped defaults in
 * `lib/products/curatedImages.ts` are `/images/products/…`), SVGs, and the
 * placeholder/icon/badge assets this app renders for missing imagery. Kept in
 * one exported place because three write paths produce image sets — create,
 * update and the image replace in `repository.saveProductImages` — and the
 * store rejects the request when they disagree about what is allowed.
 */
export function wooImageSources(images: Array<string | null | undefined>): string[] {
  return images
    .map((image) => (typeof image === 'string' ? image.trim() : ''))
    .filter((url) => {
      if (!url || !/^https?:\/\//i.test(url)) return false;
      if (/\.svg(\?|$)/i.test(url)) return false;
      if (/(placeholder|favicon|icon|badge|sprite|loader|spinner|pixel)/i.test(url)) return false;
      return true;
    });
}

export function toWooProductBody(
  patch: AdminProductPatch
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (patch.name !== undefined) body.name = patch.name;
  if (patch.slug !== undefined) body.slug = patch.slug;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.shortDescription !== undefined) body.short_description = patch.shortDescription;
  // An empty SKU is a clear instruction to remove it, but an absent one is not.
  if (patch.sku !== undefined) body.sku = patch.sku;
  if (patch.type !== undefined) body.type = patch.type;

  Object.assign(body, priceFields(patch));

  if (patch.categoryIds !== undefined) {
    body.categories = patch.categoryIds.map((id) => ({ id }));
  }
  if (patch.tags !== undefined) {
    body.tags = patch.tags.map((name) => ({ name }));
  }
  if (patch.images !== undefined) {
    body.images = patch.images
      .map((entry) => {
        if (typeof entry === 'string') {
          const trimmed = wooImageSources([entry])[0];
          return trimmed ? { src: trimmed } : null;
        }
        if (entry && typeof entry === 'object') {
          const item = entry as { src?: string; alt?: string; id?: number; name?: string };
          const out: Record<string, unknown> = {};
          if (typeof item.id === 'number' && item.id > 0) out.id = item.id;
          if (typeof item.src === 'string' && item.src.trim()) out.src = item.src.trim();
          if (typeof item.alt === 'string' && item.alt.trim()) out.alt = item.alt.trim();
          if (typeof item.name === 'string' && item.name.trim()) out.name = item.name.trim();
          return Object.keys(out).length ? out : null;
        }
        return null;
      })
      .filter((img): img is Record<string, unknown> => img !== null);
  }
  if (patch.featured !== undefined) body.featured = patch.featured;

  if (patch.manageStock !== undefined) body.manage_stock = patch.manageStock;
  if (patch.stockQuantity !== undefined) body.stock_quantity = patch.stockQuantity;
  if (patch.stockStatus !== undefined) body.stock_status = patch.stockStatus;
  if (patch.backorders !== undefined) body.backorders = patch.backorders;
  if (patch.lowStockAmount !== undefined) body.low_stock_amount = patch.lowStockAmount;
  if (patch.weight !== undefined) {
    body.weight = patch.weight === null ? '' : String(patch.weight);
  }
  if (patch.dimensions !== undefined) {
    body.dimensions = {
      ...(patch.dimensions.length !== undefined ? { length: patch.dimensions.length === null ? '' : String(patch.dimensions.length) } : {}),
      ...(patch.dimensions.width !== undefined ? { width: patch.dimensions.width === null ? '' : String(patch.dimensions.width) } : {}),
      ...(patch.dimensions.height !== undefined ? { height: patch.dimensions.height === null ? '' : String(patch.dimensions.height) } : {}),
    };
  }

  const meta: Array<{ key: string; value: string }> = [];
  // The console's own fields travel in the same `meta_data` write as the
  // economics below: one table says where each of them lives, so a field cannot
  // be sent by the editor and forgotten by the mapper.
  const consolePatch = patch as unknown as Record<string, unknown>;
  for (const entry of CONSOLE_META_FIELDS) {
    if (consolePatch[entry.field] === undefined) continue;
    meta.push({ key: entry.key, value: toConsoleMetaValue(entry.kind, consolePatch[entry.field]) });
  }
  if (patch.costPrice !== undefined) meta.push({ key: SEO_META_KEYS.costPrice, value: patch.costPrice == null ? '' : String(patch.costPrice) });
  if (patch.landedCost !== undefined) meta.push({ key: SEO_META_KEYS.landedCost, value: patch.landedCost == null ? '' : String(patch.landedCost) });
  if (patch.packagePreset !== undefined) meta.push({ key: SEO_META_KEYS.packagePreset, value: patch.packagePreset ?? '' });
  if (patch.seoKeywords !== undefined) meta.push({ key: SEO_META_KEYS.keywords, value: JSON.stringify(patch.seoKeywords) });
  if (patch.canonicalSlug !== undefined) meta.push({ key: SEO_META_KEYS.canonicalSlug, value: patch.canonicalSlug ?? '' });

  if (patch.seo !== undefined) {
    if (patch.seo.title !== undefined) {
      meta.push({ key: SEO_META_KEYS.title, value: patch.seo.title ?? '' });
    }
    if (patch.seo.description !== undefined) {
      meta.push({ key: SEO_META_KEYS.description, value: patch.seo.description ?? '' });
    }
  }
  if (meta.length) body.meta_data = meta;

  return body;
}

/** Builds the body for a single variation update. */
export function toWooVariationBody(patch: AdminVariationPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.regularPrice !== undefined) {
    body.regular_price = toWooDecimal(patch.regularPrice);
  }
  if (patch.salePrice !== undefined) body.sale_price = toWooDecimal(patch.salePrice);
  if (patch.sku !== undefined) body.sku = patch.sku;
  if (patch.manageStock !== undefined) body.manage_stock = patch.manageStock;
  if (patch.stockQuantity !== undefined) body.stock_quantity = patch.stockQuantity;
  if (patch.stockStatus !== undefined) body.stock_status = patch.stockStatus;
  if (patch.lowStockAmount !== undefined) body.low_stock_amount = patch.lowStockAmount;
  // A variation carries meta too, and the console's cost figure has a home
  // there — the same key its parent product's cost uses.
  if (patch.costPrice !== undefined) {
    body.meta_data = [
      { key: SEO_META_KEYS.costPrice, value: patch.costPrice == null ? '' : String(patch.costPrice) },
    ];
  }
  return body;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** The subset of a Woo REST v3 product this module reads. */
export interface WooProductLike {
  id?: number;
  name?: string;
  slug?: string;
  type?: string;
  status?: string;
  description?: string;
  short_description?: string;
  sku?: string;
  regular_price?: string;
  sale_price?: string;
  price?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  manage_stock?: boolean;
  low_stock_amount?: number | null;
  weight?: string;
  dimensions?: { length?: string; width?: string; height?: string };
  featured?: boolean;
  images?: Array<{ id?: number; src?: string; alt?: string }>;
  categories?: Array<{ id?: number; name?: string; slug?: string }>;
  tags?: Array<{ id?: number; name?: string; slug?: string }>;
  variations?: number[];
  meta_data?: Array<{ key?: string; value?: unknown }>;
  permalink?: string;
  date_modified_gmt?: string;
}

/** One variation, as the storefront and the editor both need it. */
export interface WooVariationLike {
  id?: number;
  regular_price?: string;
  sale_price?: string;
  sku?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  manage_stock?: boolean;
  attributes?: Array<{ name?: string; option?: string }>;
  /** The variation's own shot, when the store gave it one. */
  image?: { src?: string } | null;
}

/** A product as the admin editor consumes it. Absence is `null`, never zero. */
/**
 * The console-owned half of a product patch.
 *
 * Every field here is stored as `meta_data` — see `CONSOLE_META_FIELDS`. They
 * are grouped in their own interface because they share a fate: they are not
 * WooCommerce's, they are this console's record of the product, and they are
 * what the editor kept losing.
 */
export interface ConsoleProductFields {
  shortTitle?: string | null;
  subtitle?: string | null;
  brand?: string | null;
  currency?: string | null;
  features?: string[] | null;
  specifications?: Record<string, unknown> | null;
  shippingCost?: number | null;
  freeShipping?: boolean | null;
  deliveryMinDays?: number | null;
  deliveryMaxDays?: number | null;
  shippingNote?: string | null;
  usInventory?: boolean | null;
  supplierSource?: string | null;
  supplierProductRef?: string | null;
  supplierUrl?: string | null;
  supplierStockStatus?: string | null;
  commerceReadiness?: string | null;
  sourceType?: string | null;
  inventorySource?: string | null;
  fulfillmentMethod?: string | null;
  intendedSpecies?: string | null;
  safetyClass?: string | null;
  safetyReviewStatus?: string | null;
  riskFlags?: string[] | null;
  /** The owner's explicit storefront-niche approval for this product. */
  nicheApproved?: boolean | null;
  newArrival?: boolean | null;
  trending?: boolean | null;
  bestRated?: boolean | null;
  bestSeller?: boolean | null;
  promoted?: boolean | null;
  saleEnabled?: boolean | null;
  discountType?: string | null;
  discountValue?: number | null;
  sortOrder?: number | null;
  listingEndsAt?: string | null;
  ogImage?: string | null;
  ownerNotes?: string | null;
  evidenceNotes?: string | null;
}

export interface AdminProductRecord {
  id: number;
  name: string;
  slug: string;
  type: 'simple' | 'variable';
  status: WooProductStatus;
  isListed: boolean;
  isFeatured: boolean;
  shortDescription: string;
  description: string;
  sku: string | null;
  /** What the customer pays, when the parent reports it. */
  price: number | null;
  compareAtPrice: number | null;
  categoryIds: number[];
  categoryNames: string[];
  tags: string[];
  images: string[];
  /**
   * Images the storefront renders that WooCommerce does not hold.
   *
   * These are the app-shipped defaults in `lib/products/curatedImages.ts`, the
   * photography this repository carries for the products whose upstream gallery
   * is empty or legacy. The storefront overlays them on the product read
   * (`buildProduct`), so a customer sees them — but they are not media items in
   * WordPress, they are not in `images` above, and before this field existed the
   * admin editor showed a single placeholder for a product whose storefront page
   * displayed four photographs, with nothing saying why.
   *
   * Read-only by construction: the editor must never write them back as gallery
   * image URLs. They are relative paths in this app (`/images/products/…`), which
   * WooCommerce cannot accept, and the storefront would then list the same file
   * twice — once as a default and once as a gallery image.
   */
  storefrontDefaultImages: string[];
  stockStatus: WooStockStatus | 'unknown';
  stockQuantity: number | null;
  manageStock: boolean;
  weight: number | null;
  dimensions: { length: number | null; width: number | null; height: number | null };
  costPrice: number | null;
  landedCost: number | null;
  packagePreset: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  canonicalSlug: string | null;
  permalink: string | null;
  dateModified: string | null;
  /**
   * The console's own fields, read back out of the store's meta.
   *
   * A field the store holds no value for is **absent** from this record rather
   * than zeroed: the console can then keep its own default for a product nobody
   * has configured, and still show the stored value for one that has. Reading
   * them back matters as much as writing them — a save the owner cannot see
   * after a reload is indistinguishable from a save that failed.
   */
  consoleFields: Record<string, unknown>;
}

/** Every console field the store has a value for, parsed back to its kind. */
export function consoleFieldsFromMeta(row: WooProductLike): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const entry of CONSOLE_META_FIELDS) {
    const raw = metaValue(row, entry.key);
    if (raw === null) continue;
    fields[entry.field] = fromConsoleMetaValue(entry.kind, raw);
  }
  return fields;
}

function normaliseStatus(value: unknown): WooProductStatus {
  const raw = String(value ?? '').trim();
  if (raw === 'publish' || raw === 'draft' || raw === 'pending' || raw === 'private') {
    return raw;
  }
  // Anything else the store reports (future, trash, inherit) is not a listing
  // state the editor offers. Draft is the safe reading: it is not public.
  return 'draft';
}

function normaliseStockStatus(value: unknown): WooStockStatus | 'unknown' {
  const raw = String(value ?? '').trim();
  return raw === 'instock' || raw === 'outofstock' || raw === 'onbackorder' ? raw : 'unknown';
}

function seoMeta(row: WooProductLike, key: string): string | null {
  const entry = row.meta_data?.find((item) => item.key === key);
  if (!entry || entry.value === undefined || entry.value === null) return null;
  const value = String(entry.value).trim();
  return value || null;
}

/** Projects a Woo REST v3 product into the editor's record shape. */
export function fromWooProduct(row: WooProductLike): AdminProductRecord {
  const images = (row.images ?? [])
    .map((image) => image.src)
    .filter((src): src is string => Boolean(src));

  // The storefront-only half of the product's imagery: the app-shipped defaults
  // that are not already a gallery image. The filter matters — a product whose
  // owner has uploaded the same file Woo holds must not be reported as showing
  // something extra, and the storefront's own overlay de-duplicates by URL, so
  // an image present in both places is one image to the customer.
  const storefrontDefaultImages = curatedProductImages(String(row.slug ?? ''), row.sku).filter(
    (src) => !images.includes(src)
  );

  const categories = row.categories ?? [];
  const selling = sellingPrice(row);

  return {
    id: Number(row.id ?? 0),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    type: row.type === 'variable' ? 'variable' : 'simple',
    status: normaliseStatus(row.status),
    isListed: normaliseStatus(row.status) === 'publish',
    isFeatured: Boolean(row.featured),
    shortDescription: String(row.short_description ?? ''),
    description: String(row.description ?? ''),
    sku: (row.sku ?? '').trim() || null,
    price: selling.price,
    compareAtPrice: selling.compareAtPrice,
    categoryIds: categories.map((c) => Number(c.id)).filter((id) => Number.isFinite(id)),
    categoryNames: categories.map((c) => String(c.name ?? '')).filter(Boolean),
    tags: (row.tags ?? []).map((tag) => String(tag.name ?? '')).filter(Boolean),
    images,
    storefrontDefaultImages,
    stockStatus: normaliseStockStatus(row.stock_status),
    stockQuantity: typeof row.stock_quantity === 'number' ? row.stock_quantity : null,
    manageStock: Boolean(row.manage_stock),
    weight: parseWooDecimal(row.weight),
    dimensions: {
      length: parseWooDecimal(row.dimensions?.length),
      width: parseWooDecimal(row.dimensions?.width),
      height: parseWooDecimal(row.dimensions?.height),
    },
    costPrice: numberMetaValue(row, SEO_META_KEYS.costPrice),
    landedCost: numberMetaValue(row, SEO_META_KEYS.landedCost),
    packagePreset: metaValue(row, SEO_META_KEYS.packagePreset),
    seoTitle: seoMeta(row, SEO_META_KEYS.title),
    seoDescription: seoMeta(row, SEO_META_KEYS.description),
    seoKeywords: stringListMetaValue(row, SEO_META_KEYS.keywords),
    canonicalSlug: metaValue(row, SEO_META_KEYS.canonicalSlug),
    permalink: row.permalink ? String(row.permalink) : null,
    dateModified: row.date_modified_gmt ? String(row.date_modified_gmt) : null,
    consoleFields: consoleFieldsFromMeta(row),
  };
}

/**
 * The price range a variable product actually sells at.
 *
 * Returns `null` when no variation reports a price, which is the honest answer
 * for the products on this catalog whose variations are unpriced too.
 */
export function variationPriceRange(
  variations: WooVariationLike[]
): { min: number; max: number } | null {
  const prices = variations
    .map((variation) => parseWooDecimal(variation.sale_price) ?? parseWooDecimal(variation.regular_price))
    .filter((value): value is number => value !== null);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Human label for a variation's option set, e.g. "Fine Grain". */
export function variationLabel(variation: WooVariationLike): string {
  const parts = (variation.attributes ?? [])
    .map((attribute) => String(attribute.option ?? '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : `Variation ${variation.id ?? ''}`.trim();
}
