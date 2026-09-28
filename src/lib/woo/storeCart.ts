/**
 * The storefront cart, as WooCommerce's Store API serves it.
 *
 * ## Why the Store API and not REST v3
 *
 * `wc/store/v1` is the headless-cartfront API: it owns the cart, applies the
 * store's own pricing (sale prices, coupons, tax, shipping) and reserves stock on
 * add. `wc/v3` is the admin API — it has no cart at all, and driving one from
 * there would mean reimplementing WooCommerce's cart rules in our code, which is
 * exactly what the migration is trying to stop doing.
 *
 * ## Where the cart lives, and what identifies it
 *
 * WooCommerce keeps the cart in its session and hands out a signed `Cart-Token`.
 * Send it back on every cart request and you get the same cart. Mutations also
 * require the session's `Nonce` (WooCommerce's CSRF guard), which arrives in a
 * response header alongside the token. Both are owned by the caller — here that
 * is `app/api/cart/route.ts`, which keeps them in httpOnly cookies so the browser
 * never holds a token it could tamper with, and `loadCartForCheckout` can read
 * the same cart from the server.
 *
 * ## What this module deliberately does NOT do
 *
 * It never reads `wc/store/v1/products`. That route returns a WordPress PHP fatal
 * on this store (HTTP 500) — verified, and unrelated to the cart, which answers
 * normally. Nothing here needs a product read: a cart line carries its own name,
 * image, SKU and price, which is why the cart could move to WooCommerce while the
 * product collection route is still broken.
 *
 * Server-only: it issues unauthenticated requests to the public Store API and
 * must never be imported into a browser bundle (the token/CSRF headers would have
 * to travel to the client for that to work, which is the design this module
 * exists to avoid).
 */

import { backendConfig } from '../backend/config';
import { buildWordPressUrl } from '../backend/wordpress';
import { looksLikeHtml, looksLikeWordPressFatal } from '../backend/wordpressFatal.mjs';
import { htmlToText, parseMinorUnitPrice } from '../backend/woocommerce';

const STORE_API = '/wc/store/v1';

/** No storefront backend is configured at all — the local demo cart's trigger. */
export const NOT_CONFIGURED = 'wordpress_not_configured';
/** The store exists but did not answer. Never a reason to run without it. */
export const STORE_UNREACHABLE = 'store_unreachable';
export const STORE_TIMEOUT = 'store_timeout';

/* ------------------------------------------------------------------ */
/* Raw payload shapes (only the fields we consume)                     */
/* ------------------------------------------------------------------ */

export interface StoreCartItemRaw {
  /** Opaque line identifier (`md5(product|variation|data)`), stable across reads. */
  key?: string;
  /** The product's id, or the *variation's* id when the line is a variation. */
  id?: number;
  /** Parent product id on variation cart items, where the store exposes it. */
  parent_id?: number;
  type?: string;
  quantity?: number;
  name?: string;

  sku?: string;
  /**
   * The chosen options, as the store reports them (`pa_grain-size` =
   * `coarse-grain`). Present only on a line that is a variation, which is how a
   * cart line says which grain it is.
   */
  variation?: Array<{ attribute?: string; value?: string }>;
  permalink?: string;
  images?: Array<{ src?: string; thumbnail?: string; alt?: string }>;
  prices?: StoreCartItemPrices;
  totals?: StoreCartItemTotals;
  quantity_limits?: { minimum?: number; maximum?: number; editable?: boolean };
}

interface StoreCartItemPrices {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_code?: string;
  currency_minor_unit?: number;
  currency_symbol?: string;
}

interface StoreCartItemTotals {
  line_subtotal?: string;
  line_total?: string;
  currency_minor_unit?: number;
}

export interface StoreCartRaw {
  items?: StoreCartItemRaw[];
  coupons?: Array<{ code?: string; discount_type?: string }>;
  items_count?: number;
  totals?: {
    total_items?: string;
    total_price?: string;
    total_shipping?: string;
    total_tax?: string;
    total_discount?: string;
    total_discount_tax?: string;
    currency_code?: string;
    currency_minor_unit?: number;
  };
  /**
   * WooCommerce's own verdicts on the cart — an item that went out of stock, a
   * quantity it will not sell. Reported by the store rather than recomputed here:
   * our arithmetic on stock is a second opinion, and the store's is the one that
   * decides what is actually chargeable.
   */
  errors?: Array<{ code?: string; message?: string; data?: { key?: string } }>;
  needs_payment?: boolean;
  needs_shipping?: boolean;
}

/* ------------------------------------------------------------------ */
/* The view the application consumes                                   */
/* ------------------------------------------------------------------ */

export interface StoreCartLine {
  /** WooCommerce's line key — what update/remove address. */
  key: string;
  /** The variation's id on a variation line, otherwise the product's id. */
  productId: string;
  /** Parent product id when the cart line is a variation. */
  parentProductId: string | null;
  name: string;
  /** The chosen option in readable form (`Coarse Grain`), or null. */
  variationLabel: string | null;
  /** Unit price in major units, or null when the store reported none. */
  unitPrice: number | null;
  quantity: number;
  image: string;
  sku: string | null;
  /** False when the store refuses quantity edits for this line. */
  editable: boolean;
  /** The store's own ceiling, or null when it did not state one. */
  maxQuantity: number | null;
}

export interface StoreCartView {
  items: StoreCartLine[];
  itemsCount: number;
  /** The store's own cart total in major units, or null when unreported. */
  totalPrice: number | null;
  /** Authoritative WooCommerce cart tax in major units, or null when unreported. */
  totalTax: number | null;
  /** WooCommerce's server-calculated discount, or null when not reported. */
  totalDiscount: number | null;
  /** The coupon codes applied to this WooCommerce cart. */
  couponCodes: string[];
  currency: string;
  /** WooCommerce's own complaints about the cart, as plain sentences. */
  issues: string[];
}

/** A Store API failure, with the endpoint and whether the origin fataled. */
export class StoreCartError extends Error {
  readonly status: number;
  readonly path: string;
  readonly code: string | null;
  readonly isWordPressFatal: boolean;

  constructor(init: {
    message: string;
    path: string;
    status: number;
    code?: string | null;
    isWordPressFatal?: boolean;
  }) {
    super(init.message);
    this.name = 'StoreCartError';
    this.path = init.path;
    this.status = init.status;
    this.code = init.code ?? null;
    this.isWordPressFatal = init.isWordPressFatal ?? false;
  }
}

/* ------------------------------------------------------------------ */
/* Pure mapping — unit tested                                          */
/* ------------------------------------------------------------------ */

function minorUnitFor(price: { currency_minor_unit?: number } | undefined): number {
  return typeof price?.currency_minor_unit === 'number' ? price.currency_minor_unit : 2;
}

/**
 * The unit price of a cart line.
 *
 * `prices.price` is what the customer pays for one unit (WooCommerce applies the
 * sale price there), so it is preferred. `line_total / quantity` is the fallback
 * because it is the same money derived from the line: a fallback that invented a
 * figure from something else (a catalog lookup, say) is how a cart starts
 * disagreeing with the checkout that charges it.
 */
export function lineUnitPrice(raw: StoreCartItemRaw): number | null {
  const direct = parseMinorUnitPrice(raw.prices?.price, minorUnitFor(raw.prices));
  if (direct !== null) return direct;

  const quantity = Number(raw.quantity ?? 0);
  const lineTotal = parseMinorUnitPrice(raw.totals?.line_total, minorUnitFor(raw.totals));
  if (lineTotal !== null && quantity > 0) return lineTotal / quantity;
  return null;
}

/**
 * A reported option value in readable form.
 *
 * The cart reports the term *slug* (`coarse-grain`) while the catalog and the order
 * email call the same option `Coarse Grain`. A slug is title-cased here rather than
 * looked up, because the lookup would be a network round trip for a caption — and a
 * value the store already capitalised is passed through untouched, since that is the
 * store's own name for it.
 */
export function readableVariationValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/[A-Z]/.test(trimmed)) return trimmed;
  return trimmed
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** The line's chosen options, in one caption, or null when it has none. */
export function cartLineVariationLabel(raw: StoreCartItemRaw): string | null {
  const values = (raw.variation ?? [])
    .map((entry) => readableVariationValue(String(entry?.value ?? '')))
    .filter(Boolean);
  return values.length ? values.join(' / ') : null;
}

/** Store API cart line -> the application's line view. */
export function mapStoreCartLine(raw: StoreCartItemRaw): StoreCartLine {
  const quantity = Number(raw.quantity ?? 0);
  const maxQuantity = raw.quantity_limits?.maximum;
  const image = raw.images?.find((entry) => entry?.src || entry?.thumbnail);

  return {
    key: String(raw.key ?? ''),
    productId: raw.id === undefined ? '' : String(raw.id),
    parentProductId:
      raw.parent_id === undefined || raw.parent_id === null || Number(raw.parent_id) <= 0
        ? null
        : String(raw.parent_id),
    // The store sends a product name with its entities intact (`Fine &amp; Coarse`),
    // exactly as the catalog read receives it — so it is decoded the same way, by
    // the one helper that does that, rather than reaching a cart line as `&amp;`.
    name: htmlToText(raw.name),
    variationLabel: cartLineVariationLabel(raw),
    unitPrice: lineUnitPrice(raw),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
    image: image?.src || image?.thumbnail || '',
    sku: raw.sku?.trim() ? raw.sku.trim() : null,
    // Absent means "the store did not say", and an edit the store has not allowed
    // must not be presented as one it will accept.
    editable: raw.quantity_limits?.editable === true,
    maxQuantity: typeof maxQuantity === 'number' && maxQuantity > 0 ? maxQuantity : null,
  };
}

/** Store API cart -> the application's cart view. */
export function mapStoreCart(raw: StoreCartRaw): StoreCartView {
  const items = (raw.items ?? []).map(mapStoreCartLine);

  return {
    items,
    // The store's count when it reports one, otherwise the sum of the lines — the
    // count is what the header badge shows, so it follows the store.
    itemsCount: typeof raw.items_count === 'number' ? raw.items_count : items.reduce((sum, line) => sum + line.quantity, 0),
    totalPrice: parseMinorUnitPrice(raw.totals?.total_price, minorUnitFor(raw.totals)),
    totalTax: parseMinorUnitPrice(raw.totals?.total_tax, minorUnitFor(raw.totals)),
    totalDiscount: parseMinorUnitPrice(raw.totals?.total_discount, minorUnitFor(raw.totals)),
    couponCodes: (raw.coupons ?? []).map((coupon) => String(coupon.code ?? '').trim()).filter(Boolean),
    currency: raw.totals?.currency_code || '',
    issues: (raw.errors ?? [])
      .map((entry) => (entry?.message ? String(entry.message) : ''))
      .filter(Boolean),
  };
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/**
 * One Store API call, with the response headers kept.
 *
 * `wordpressRequest` in `../backend/wordpress` cannot be reused: it discards
 * every header except the row counts, and `Cart-Token`/`Nonce` arrive only as
 * headers. It reuses that module's URL building and the shared fatal-page
 * detection (`wordpressFatal.mjs`) so this client and the diagnostic script can
 * never disagree about what a PHP fatal looks like.
 */
export interface StoreApiResponse<T> {
  data: T;
  /** `Cart-Token` — the identifier for this cart, when the store sent one. */
  cartToken: string | null;
  /** `Nonce` — required on mutations, when the store sent one. */
  nonce: string | null;
}

export async function storeApiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    cartToken?: string | null;
    nonce?: string | null;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<StoreApiResponse<T>> {
  const base = backendConfig.wordpressApiRoot;
  if (!base) {
    // Its own code, because "there is no storefront backend" and "the storefront
    // backend did not answer" call for opposite handling: the first is a demo cart
    // in localStorage, the second must leave a real cart alone.
    throw new StoreCartError({
      message: 'WordPress is not configured (WORDPRESS_BASE_URL is empty).',
      path,
      status: 0,
      code: NOT_CONFIGURED,
    });
  }

  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? backendConfig.requestTimeoutMs;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.cartToken) headers['Cart-Token'] = options.cartToken;
  // The nonce is required only for mutations, but sending it on a read is
  // harmless and means a read that follows a stale nonce still refreshes it.
  if (options.nonce) headers.Nonce = options.nonce;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildWordPressUrl(path, base), {
      method,
      headers,
      signal: controller.signal,
      cache: 'no-store',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new StoreCartError({
      message: aborted
        ? `The store's cart did not respond within ${timeoutMs}ms (${path}).`
        : `The store's cart could not be reached (${path}): ${error instanceof Error ? error.message : String(error)}`,
      path,
      status: 0,
      code: aborted ? STORE_TIMEOUT : STORE_UNREACHABLE,
    });
  } finally {
    clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
  }

  const rawBody = await response.text().catch(() => '');
  const fatal = looksLikeWordPressFatal(rawBody);
  const isHtml = looksLikeHtml(rawBody);

  if (!response.ok || fatal) {
    let code: string | null = null;
    let message = `The store's cart returned HTTP ${response.status} (${path}).`;
    if (!isHtml) {
      try {
        const parsed = JSON.parse(rawBody) as { code?: string; message?: string };
        code = parsed.code ?? null;
        if (parsed.message) {
          message = String(parsed.message).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      } catch {
        /* not JSON — the generic message stands */
      }
    }
    if (fatal) {
      message =
        `The store threw a PHP fatal error (HTTP ${response.status}) on ${path}. ` +
        'That is a server-side WordPress problem, not a cart bug.';
    }
    throw new StoreCartError({
      message,
      path,
      status: response.status,
      code,
      isWordPressFatal: fatal,
    });
  }

  let data: T;
  try {
    data = JSON.parse(rawBody) as T;
  } catch {
    throw new StoreCartError({
      message: `The store's cart returned HTTP ${response.status} (${path}) but the body was not JSON.`,
      path,
      status: response.status,
    });
  }

  return {
    data,
    cartToken: response.headers.get('cart-token'),
    nonce: response.headers.get('nonce'),
  };
}

/* ------------------------------------------------------------------ */
/* Cart operations                                                     */
/* ------------------------------------------------------------------ */

export interface CartSession {
  cartToken: string | null;
  nonce: string | null;
}

/** Reads the cart, minting a cart token when the caller has none. */
export async function readStoreCart(session: CartSession): Promise<{
  cart: StoreCartRaw;
  session: CartSession;
}> {
  const response = await storeApiRequest<StoreCartRaw>(`${STORE_API}/cart`, {
    cartToken: session.cartToken,
    nonce: session.nonce,
  });
  return {
    cart: response.data,
    session: {
      cartToken: response.cartToken || session.cartToken,
      nonce: response.nonce || session.nonce,
    },
  };
}

/**
 * A nonce is valid for a limited window (WooCommerce's own nonce lifetime), so a
 * cart token kept in a cookie outlives it. When that happens WooCommerce answers
 * `woocommerce_rest_invalid_nonce`; re-reading the cart hands out a fresh nonce,
 * so the mutation is retried once against it. Retrying is deliberate rather than
 * making the client start over: from the shopper's point of view the first click
 * simply worked.
 */
function isStaleNonce(error: unknown): boolean {
  if (!(error instanceof StoreCartError)) return false;
  return (
    error.code === 'woocommerce_rest_invalid_nonce' ||
    error.code === 'woocommerce_rest_missing_nonce' ||
    (error.status === 403 && error.code === null) ||
    (error.status === 400 && typeof error.message === 'string' && error.message.toLowerCase().includes('nonce'))
  );
}

async function mutate(
  session: CartSession,
  path: string,
  body: Record<string, unknown>,
  timeoutMs?: number
): Promise<{ cart: StoreCartRaw; session: CartSession }> {
  const timeout = timeoutMs ?? backendConfig.mutationTimeoutMs;
  try {
    const response = await storeApiRequest<StoreCartRaw>(`${STORE_API}${path}`, {
      method: 'POST',
      cartToken: session.cartToken,
      nonce: session.nonce,
      body,
      timeoutMs: timeout,
    });
    return {
      cart: response.data,
      session: {
        cartToken: response.cartToken || session.cartToken,
        nonce: response.nonce || session.nonce,
      },
    };
  } catch (error) {
    if (!isStaleNonce(error)) throw error;
    const fresh = await readStoreCart(session);
    const retry = await storeApiRequest<StoreCartRaw>(`${STORE_API}${path}`, {
      method: 'POST',
      cartToken: fresh.session.cartToken,
      nonce: fresh.session.nonce,
      body,
      timeoutMs: timeout,
    });
    return {
      cart: retry.data,
      session: {
        cartToken: retry.cartToken || fresh.session.cartToken,
        nonce: retry.nonce || fresh.session.nonce,
      },
    };
  }
}

/**
 * Adds a product — or one of its variations — to the store's cart.
 *
 * A variable product is addressed by its parent id plus the chosen option, and
 * WooCommerce prices and validates the pair itself: the option arrives from the
 * catalog read, the amount charged comes back from the store, and nothing the
 * browser sends is trusted for money. `variation` is omitted entirely for a simple
 * product, so a line can never claim an option the product does not have.
 *
 * Reconciles with the authoritative cart on timeout: if WordPress finishes adding
 * the item despite a network timeout, the updated cart is returned rather than a
 * false failure that would cause duplicate adds on retry.
 */
export async function addStoreCartItem(
  session: CartSession,
  productId: string | number,
  quantity: number,
  variation?: { attribute: string; value: string },
  options?: { previousQuantity?: number; timeoutMs?: number; settleMs?: number }
): Promise<{ cart: StoreCartRaw; session: CartSession; reconciled?: boolean }> {
  const attribute = variation?.attribute?.trim();
  const value = variation?.value?.trim();
  const numId = Number(productId);
  const body = {
    id: numId,
    quantity,
    ...(attribute && value ? { variation: [{ attribute, value }] } : {}),
  };

  try {
    return await mutate(session, '/cart/add-item', body, options?.timeoutMs);
  } catch (error) {
    // If the Store API timed out, WooCommerce may have still processed the
    // add on the server. Reconcile with the authoritative cart before failing.
    if (error instanceof StoreCartError && error.code === STORE_TIMEOUT && session.cartToken) {
      try {
        const settle = options?.settleMs ?? 600;
        if (settle > 0) {
          await new Promise((resolve) => setTimeout(resolve, settle));
        }
        const reconciled = await readStoreCart(session);
        const matchingItem = (reconciled.cart.items ?? []).find((item) => {
          if (item.id !== numId) return false;
          if (attribute && value) {
            return (item.variation ?? []).some(
              (v) => v.attribute === attribute && v.value === value
            );
          }
          return true;
        });

        const currentQty = matchingItem?.quantity ?? 0;
        const prevQty = options?.previousQuantity;

        // If previousQuantity was provided, check if current quantity increased
        const didAdd = prevQty !== undefined
          ? currentQty > prevQty
          : currentQty >= quantity;

        if (didAdd) {
          return { ...reconciled, reconciled: true };
        }
      } catch {
        // Reconciliation read failed; fall through to throw original timeout error
      }
    }
    throw error;
  }
}

export function updateStoreCartItem(
  session: CartSession,
  key: string,
  quantity: number
): Promise<{ cart: StoreCartRaw; session: CartSession }> {
  return mutate(session, '/cart/update-item', { key, quantity });
}

export function removeStoreCartItem(
  session: CartSession,
  key: string
): Promise<{ cart: StoreCartRaw; session: CartSession }> {
  return mutate(session, '/cart/remove-item', { key });
}

/**
 * Empties the cart.
 *
 * The Store API has no bulk clear, so the lines are removed one at a time
 * against the cart as the store reports it — reading the keys from the store
 * rather than from anything the client sent. The final response is returned, so
 * the caller always ends with the store's own post-mutation cart.
 */
export async function clearStoreCart(session: CartSession): Promise<{
  cart: StoreCartRaw;
  session: CartSession;
}> {
  let current = await readStoreCart(session);
  const keys = (current.cart.items ?? [])
    .map((item) => String(item.key ?? ''))
    .filter(Boolean);

  for (const key of keys) {
    current = await removeStoreCartItem(current.session, key);
  }
  return current;
}

export interface CartCustomerAddress {
  country?: string;
  state?: string;
  city?: string;
  postalCode?: string;
}

/**
 * Updates customer destination address on the WooCommerce cart session.
 *
 * This triggers authoritative WooCommerce tax calculation based on nexus
 * and tax rules configured in WordPress, returning the recalculated totals.
 */
export async function setStoreCartCoupon(
  session: CartSession,
  couponCode: string | null,
): Promise<{ cart: StoreCartRaw; session: CartSession }> {
  let current = await readStoreCart(session);

  // One customer-entered code is supported by the storefront. Remove any coupon
  // already carried by this WooCommerce session before validating the new one.
  for (const coupon of current.cart.coupons ?? []) {
    const code = String(coupon.code ?? '').trim();
    if (!code) continue;
    current = await mutate(current.session, '/cart/remove-coupon', { code });
  }

  const normalized = couponCode?.trim();
  if (!normalized) return current;
  return mutate(current.session, '/cart/apply-coupon', { code: normalized });
}

export async function updateStoreCartCustomer(
  session: CartSession,
  address: CartCustomerAddress
): Promise<{ cart: StoreCartRaw; session: CartSession }> {
  const addr = {
    country: address.country || 'US',
    state: address.state || '',
    city: address.city || '',
    postcode: address.postalCode || '',
  };
  return mutate(session, '/cart/update-customer', {
    shipping_address: addr,
    billing_address: addr,
  });
}
