/**
 * WooCommerce access.
 *
 * Two distinct APIs are used, and the difference matters:
 *
 *  - **Store API** (`/wp-json/wc/store/v1/...`) is public, needs no keys, and is
 *    the correct source for the headless storefront. On staging its product
 *    routes currently return a WordPress PHP fatal (HTTP 500).
 *  - **REST v3** (`/wp-json/wc/v3/...`) requires a consumer key/secret pair.
 *    Server-only. This is the route that actually reports price, SKU and stock
 *    while the Store API product endpoints are broken.
 *
 * Both mappers emit `Product` — the single view model defined in
 * `src/data/products.ts`. They deliberately do NOT read `compare_at_price`:
 * that column's meaning (top of a variant price range) is owned solely by
 * `src/lib/products/mapProduct.ts`, and a second interpretation here is what
 * let the two backends disagree about a product's price.
 *
 * The mappers are pure so they can be unit tested without network access.
 */

import type { Product, StockStatus } from '../../data/products';
import { collectMissingCatalogFields, priceDisplayFromRange } from '../products/price';
import { productSlugFromName } from '../products/slug';
import { resolveCuratedProductImages } from '../products/curatedImages';
import { variationPriceRange, type WooVariationLike } from '../woo/productPayload';
import {
  productVariations,
  variationOptionLabels,
  type RestV3Attribute,
} from '../woo/variationOptions';
import { backendConfig } from './config';
import { hasWooCommerceCredentials } from './credentials';
import {
  wordpressRequest,
  wordpressRequestSafe,
  WORDPRESS_MAX_PER_PAGE,
  type QueryValue,
} from './wordpress';

const STORE_API = '/wc/store/v1';
const REST_V3 = '/wc/v3';

/* ------------------------------------------------------------------ */
/* Raw payload shapes (only the fields we actually consume)            */
/* ------------------------------------------------------------------ */

export interface StoreApiPrices {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_code?: string;
  currency_minor_unit?: number;
}

export interface StoreApiImage {
  id?: number;
  src?: string;
  thumbnail?: string;
  alt?: string;
}

export interface StoreApiTerm {
  id?: number;
  name?: string;
  slug?: string;
}

export interface StoreApiProduct {
  id?: number;
  name?: string;
  slug?: string;
  permalink?: string;
  sku?: string;
  prices?: StoreApiPrices;
  images?: StoreApiImage[];
  categories?: StoreApiTerm[];
  description?: string;
  short_description?: string;
  is_in_stock?: boolean;
  is_on_backorder?: boolean;
  on_sale?: boolean;
  is_featured?: boolean;
  /**
   * WooCommerce's own stock block. `remaining` is present only when the product
   * has tracked stock, so its absence is "not tracked", never zero.
   */
  stock_availability?: {
    text?: string;
    class?: string;
    remaining?: number | null;
  };
}

/** WooCommerce REST v3 product (authenticated; carries price and stock). */
export interface RestV3Product {
  id?: number;
  name?: string;
  slug?: string;
  permalink?: string;
  sku?: string;
  /** Decimal strings, e.g. "19.95". Empty string when unset. */
  price?: string;
  regular_price?: string;
  sale_price?: string;
  description?: string;
  short_description?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  featured?: boolean;
  images?: Array<{ id?: number; src?: string; alt?: string }>;
  categories?: Array<{ id?: number; name?: string; slug?: string }>;
  date_modified_gmt?: string;
  /** 'simple' | 'variable' | … — decides whether prices live on the variations. */
  type?: string;
  /** Variation ids, present only on a variable product. */
  variations?: number[];
  /** Declared attributes; the ones with `variation: true` are what a shopper picks. */
  attributes?: RestV3Attribute[];
}

/** WordPress core product (public; no price or stock, used only as fallback). */
export interface WpCoreProduct {
  id?: number;
  slug?: string;
  link?: string;
  modified?: string;
  featured_media?: number;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  product_cat?: number[];
  _embedded?: Record<string, Array<{ source_url?: string; alt_text?: string }>>;
}

/**
 * Storefront slugs a merged product retired, and what sells them now.
 *
 * Two maps exist for one retirement because two servers publish the same product:
 * the WordPress-served `/product/<slug>` is covered by
 * `hk_storefront_retired_product_slugs()` in the plugin, and the storefront's own
 * `/products/<slug>` is covered here — this app never sees the plugin's redirect,
 * and the plugin never sees this route. Keep them in step when a merge retires a
 * product; a retired slug with no entry here is a dead link on the storefront.
 */
export const RETIRED_PRODUCT_SLUGS: Record<string, string> = {
  'himalayan-salt-fine-grain-6-lbs': 'himalayan-salt-6-lbs',
  'himalayan-salt-coarse-grain-6-lbs': 'himalayan-salt-6-lbs',
  'himalayan-pink-edible-salt-fine-grain-16-oz-jar': 'himalayan-pink-edible-salt-16-oz-jar',
  'himalayan-pink-edible-salt-coarse-grain-16-oz-jar': 'himalayan-pink-edible-salt-16-oz-jar',
};

/**
 * Category name the catalog model carries when a source reported none.
 *
 * The storefront needs a non-empty string in `Product.category`, so the model has
 * a placeholder. Consumers that must not invent taxonomy — the admin catalog read
 * model counts categories — treat this value as "not reported" instead.
 */
export const UNCATEGORIZED_CATEGORY = 'Uncategorized';

/* ------------------------------------------------------------------ */
/* Pure helpers — unit tested                                          */
/* ------------------------------------------------------------------ */

/**
 * Converts a Store API minor-unit price string to major units.
 * ('1995', 2) -> 19.95. Returns null when the backend sent nothing, so an
 * unset price stays unknown instead of becoming 0.
 */
export function parseMinorUnitPrice(value: string | undefined | null, minorUnit = 2): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  return numeric / 10 ** minorUnit;
}

/** Converts a REST v3 decimal price string to a number, or null when unset. */
export function parseMajorUnitPrice(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Maps WooCommerce stock wording onto our closed set. Unknown stays unknown. */
export function normalizeStockStatus(value: string | undefined | null): StockStatus {
  switch ((value || '').trim().toLowerCase()) {
    case 'instock':
    case 'in_stock':
      return 'in_stock';
    case 'outofstock':
    case 'out_of_stock':
      return 'out_of_stock';
    case 'onbackorder':
    case 'on_backorder':
      return 'on_backorder';
    default:
      return 'unknown';
  }
}

/** Strips tags and decodes the entities WordPress emits. */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Purchase availability for the storefront.
 *
 * Only a positive report counts as in stock; anything unreported stays unknown
 * and is treated as not purchasable, so a source that cannot report stock never
 * silently enables checkout.
 */
export function isPurchasable(stockStatus: StockStatus): boolean {
  return stockStatus === 'in_stock' || stockStatus === 'on_backorder';
}

/** Assembles a `Product`, deriving the display price from the resolved range. */
function buildProduct(input: {
  id: number | string;
  slug: string;
  name: string;
  description: string;
  priceMin: number | null;
  priceMax?: number;
  images: string[];
  category: string;
  stockStatus: StockStatus;
  /** Units the source reports, or null when it reports no count. */
  stockQuantity?: number | null;
  sku: string | null;
  isFeatured: boolean;
  updatedAt: string | null;
}): Product {
  const price = priceDisplayFromRange(input.priceMin, input.priceMax);
  const images = resolveCuratedProductImages(input.slug, input.sku, input.images);
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    price,
    priceRange: Boolean(input.priceMax),
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    image: images[0] ?? '',
    images,
    category: input.category || UNCATEGORIZED_CATEGORY,
    description: input.description || undefined,
    inStock: isPurchasable(input.stockStatus),
    isFeatured: input.isFeatured,
    sku: input.sku,
    stockStatus: input.stockStatus,
    stockQuantity: input.stockQuantity ?? null,
    updatedAt: input.updatedAt,
    missing: collectMissingCatalogFields({
      priceMin: input.priceMin,
      sku: input.sku,
      stockStatus: input.stockStatus,
      images,
    }),
  };
}

/**
 * A reported unit count, or null when the source reported none.
 *
 * Guarded rather than coerced: `undefined`, `null`, `NaN` and a negative number
 * all mean "no count I can stand behind", and none of them becomes a zero that
 * the storefront would then render as "out of stock".
 */
function finiteCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function imageUrls(images: Array<{ src?: string; thumbnail?: string }> | undefined): string[] {
  return (images ?? []).map((image) => image?.src || image?.thumbnail || '').filter(Boolean);
}

/** Store API product -> Product. */
export function mapStoreProduct(raw: StoreApiProduct): Product {
  const minorUnit = typeof raw.prices?.currency_minor_unit === 'number' ? raw.prices.currency_minor_unit : 2;
  const priceMin = parseMinorUnitPrice(raw.prices?.price, minorUnit);

  const stockStatus: StockStatus =
    raw.is_on_backorder === true
      ? 'on_backorder'
      : raw.is_in_stock === true
        ? 'in_stock'
        : raw.is_in_stock === false
          ? 'out_of_stock'
          : 'unknown';

  return buildProduct({
    id: raw.id ?? '',
    slug: raw.slug ?? '',
    name: htmlToText(raw.name),
    // WooCommerce sends markup, and the product page renders this value as text, so
    // `<p>` used to appear verbatim in the middle of a product's copy.
    description: htmlToText(raw.short_description || raw.description),
    priceMin,
    images: imageUrls(raw.images),
    category: htmlToText(raw.categories?.[0]?.name),
    stockStatus,
    stockQuantity: finiteCount(raw.stock_availability?.remaining),
    sku: raw.sku?.trim() ? raw.sku.trim() : null,
    isFeatured: raw.is_featured === true,
    updatedAt: null,
  });
}

/** REST v3 product -> Product. The complete source when credentials exist. */
export function mapRestV3Product(raw: RestV3Product): Product {
  // `price` is what the customer actually pays (WooCommerce applies the sale
  // price there). A discount is not a variant range, so it is not written into
  // priceMax — that field means "top of the variant range" everywhere else.
  const priceMin = parseMajorUnitPrice(raw.price) ?? parseMajorUnitPrice(raw.sale_price) ?? parseMajorUnitPrice(raw.regular_price);

  return buildProduct({
    id: raw.id ?? '',
    slug: raw.slug ?? '',
    name: htmlToText(raw.name),
    // Same as `mapStoreProduct`: the page renders this as text, so the store's markup
    // is reduced to the sentence it carries.
    description: htmlToText(raw.short_description || raw.description),
    priceMin,
    images: imageUrls(raw.images),
    category: htmlToText(raw.categories?.[0]?.name),
    stockStatus: normalizeStockStatus(raw.stock_status),
    // REST v3 sends null for a product that does not manage stock, which stays
    // null here: "not tracked" and "none left" are different answers.
    stockQuantity: finiteCount(raw.stock_quantity),
    sku: raw.sku?.trim() ? raw.sku.trim() : null,
    isFeatured: raw.featured === true,
    updatedAt: raw.date_modified_gmt ?? null,
  });
}

/**
 * WordPress core product -> Product.
 *
 * Price and stock are deliberately unknown: the core route does not expose
 * them. Reporting anything else would be inventing commercial data.
 */
export function mapWpCoreProduct(raw: WpCoreProduct): Product {
  const images: string[] = [];
  const featured = raw._embedded?.['wp:featuredmedia']?.[0]?.source_url;
  if (featured) images.push(featured);

  return buildProduct({
    id: raw.id ?? '',
    slug: raw.slug ?? '',
    name: htmlToText(raw.title?.rendered),
    description: raw.content?.rendered || raw.excerpt?.rendered || '',
    priceMin: null,
    images,
    category: '',
    stockStatus: 'unknown',
    sku: null,
    isFeatured: false,
    updatedAt: raw.modified ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Network reads                                                       */
/* ------------------------------------------------------------------ */

export interface ProductQuery {
  perPage?: number;
  page?: number;
  category?: string | number;
  search?: string;
  slug?: string;
  featured?: boolean;
  orderby?: 'date' | 'price' | 'popularity' | 'rating' | 'title';
  order?: 'asc' | 'desc';
  signal?: AbortSignal;
}

function productParams(query: ProductQuery): Record<string, QueryValue> {
  const params: Record<string, QueryValue> = {
    per_page: query.perPage ?? 24,
    page: query.page ?? 1,
  };
  if (query.category !== undefined) params.category = query.category;
  if (query.search) params.search = query.search;
  if (query.slug) params.slug = query.slug;
  if (query.featured !== undefined) params.featured = query.featured;
  if (query.orderby) params.orderby = query.orderby;
  if (query.order) params.order = query.order;
  return params;
}

/** Public Store API product read. Never throws — reports the error instead. */
export async function fetchStoreProductsSafe(
  query: ProductQuery = {}
): Promise<{ products: Product[]; error: string | null }> {
  const { data, error } = await wordpressRequestSafe<StoreApiProduct[]>(`${STORE_API}/products`, {
    params: productParams(query),
    signal: query.signal,
  });
  return { products: (data ?? []).map(mapStoreProduct), error };
}

/**
 * Authenticated REST v3 read — the only route reporting price and stock while
 * the Store API product routes are broken. Null when no credentials are set.
 *
 * Variable products are the reason this is more than a map: WooCommerce keeps
 * their prices on the variations, so the parent row reports an empty
 * `regular_price` even though the product is priced. Without the extra read the
 * storefront showed "Price unavailable" on products a customer could buy — and
 * with grain now a variation axis, the same read is what tells the storefront
 * which options exist at all.
 */
export async function fetchAdminProducts(query: ProductQuery = {}): Promise<Product[] | null> {
  if (!hasWooCommerceCredentials()) return null;

  const raw = await wordpressRequest<RestV3Product[]>(`${REST_V3}/products`, {
    params: { ...productParams(query), status: 'publish' },
    useCredentials: true,
    signal: query.signal,
  });
  const rows = Array.isArray(raw) ? raw : [];
  return withVariations(rows, rows.map(mapRestV3Product), query.signal);
}

/** Authenticated REST v3 single-product lookup by slug. */
export async function fetchAdminProductBySlug(
  slug: string,
  signal?: AbortSignal
): Promise<Product | null> {
  if (!hasWooCommerceCredentials()) return null;

  const exact = await wordpressRequest<RestV3Product[]>(`${REST_V3}/products`, {
    params: { slug, status: 'publish', per_page: 1 },
    useCredentials: true,
    signal,
  });
  let rows = Array.isArray(exact) ? exact : [];

  // A slug a merge retired resolves to the product that replaced it, so an old
  // storefront URL lands on something buyable rather than on a 404.
  const successor = RETIRED_PRODUCT_SLUGS[slug];
  if (rows.length === 0 && successor) {
    const resolved = await wordpressRequest<RestV3Product[]>(`${REST_V3}/products`, {
      params: { slug: successor, status: 'publish', per_page: 1 },
      useCredentials: true,
      signal,
    });
    rows = Array.isArray(resolved) ? resolved : [];
  }

  // Admin-generated slugs historically used the product title while Woo kept a
  // shorter legacy slug. Resolve that safe alias server-side instead of making
  // every admin View link land on a false 404.
  if (rows.length === 0) {
    const candidates = await wordpressRequest<RestV3Product[]>(`${REST_V3}/products`, {
      params: { search: slug, status: 'publish', per_page: 100 },
      useCredentials: true,
      signal,
    });
    rows = (Array.isArray(candidates) ? candidates : []).filter((row) =>
      row.slug === slug || productSlugFromName(String(row.name ?? ''), row.slug) === slug
    ).slice(0, 1);
  }

  const [product] = await withVariations(rows, rows.map(mapRestV3Product), signal);
  return product ?? null;
}

/**
 * Reads a variable product's variations once, for both things they carry.
 *
 * The price range is filled only when the parent reports none — a variable product
 * whose variations all cost the same reports its own price, and needs no arithmetic.
 * The variation *options* are set whatever the parent's price is, because they are
 * what a shopper chooses between: a single-priced variable product with a grain
 * selector still has to tell the storefront which grains exist.
 *
 * Only variable products are read, and in parallel, so a catalog page costs one
 * round trip plus one per variable product rather than a serial chain. A failure
 * here leaves the price unknown and the options absent — never invented, because
 * an unavailable price and a free product are very different things to advertise.
 */
async function withVariations(
  rows: RestV3Product[],
  products: Product[],
  signal?: AbortSignal
): Promise<Product[]> {
  const targets = rows
    .map((row, index) => ({ row, product: products[index] }))
    .filter(
      (entry): entry is { row: RestV3Product; product: Product } =>
        Boolean(entry.product) &&
        entry.row.type === 'variable' &&
        (entry.row.variations?.length ?? 0) > 0
    );

  if (!targets.length) return products;

  await Promise.all(
    targets.map(async ({ row, product }) => {
      // Prices, cached briefly. The parent read still runs uncached, so a stock
      // change is visible on the next request; what this avoids is paying the
      // origin's latency for every variation on every screen that lists the
      // catalog, which is what made the console's catalog read take longer than
      // a request is allowed to.
      const { data } = await wordpressRequestSafe<WooVariationLike[]>(
        `${REST_V3}/products/${row.id}/variations`,
        {
          params: { per_page: WORDPRESS_MAX_PER_PAGE },
          useCredentials: true,
          signal,
          timeoutMs: 20000,
          revalidate: 60,
        }
      );
      if (!data) return;

      // What the shopper can choose. Both forms come from this one read, so the
      // labels the selector shows and the pairs the cart is told cannot disagree.
      const variations = productVariations(row.attributes, data);
      if (variations) {
        product.variations = variations;
        product.grainSizes = variationOptionLabels(variations);
      }

      // A parent that prices itself needs no range derived from its variations.
      if (product.priceMin !== null && product.priceMin > 0) return;

      const range = variationPriceRange(data);
      if (!range) return;

      // `priceMax` is the top of a variant range and stays absent when every
      // variation costs the same, so a single-price product does not render as
      // "$34.57 - $34.57". The display string is derived from the same
      // normalised max, or the label and the range would disagree.
      const max = range.max > range.min ? range.max : null;
      product.priceMin = range.min;
      product.priceMax = max ?? undefined;
      product.price = priceDisplayFromRange(range.min, max);
    })
  );

  return products;
}

/**
 * Public WordPress-core product read. Always available, never carries price.
 * Internal to the catalog adapter; it is the last-resort fallback.
 */
export async function fetchWpCoreProducts(query: ProductQuery = {}): Promise<{
  products: Product[];
  error: string | null;
}> {
  const params: Record<string, QueryValue> = {
    per_page: query.perPage ?? 24,
    status: 'publish',
    _embed: 'wp:featuredmedia',
  };
  if (query.slug) params.slug = query.slug;
  if (query.search) params.search = query.search;
  if (query.category !== undefined) params.product_cat = query.category;

  const { data, error } = await wordpressRequestSafe<WpCoreProduct[]>('/wp/v2/product', {
    params,
    signal: query.signal,
  });
  return { products: (data ?? []).map(mapWpCoreProduct), error };
}

/** The origin the read functions are pointed at, for diagnostics. */
export function woocommerceReadTarget(): string {
  return backendConfig.wordpressApiRoot || '(unset)';
}
