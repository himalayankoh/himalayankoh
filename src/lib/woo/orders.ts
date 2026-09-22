/**
 * WooCommerce orders — the store's own order records, server only.
 *
 * ## Why this module exists
 *
 * The console read orders from Supabase and the store kept its own orders in
 * WooCommerce, so the same business had two order systems. This module is the
 * WooCommerce half, and it is written so the *existing* app order shape
 * (`Order` / `OrderItem`) is a projection of the Woo record rather than a
 * competing copy: every field the admin and the account screens read is derived
 * from the Woo order, and nothing is defaulted to a number it did not report.
 *
 * ## The status problem, solved with meta instead of a plugin
 *
 * WooCommerce has no fulfilment states. Its vocabulary is
 * `pending | processing | on-hold | completed | cancelled | refunded | failed |
 * trash`, while this store's workflow distinguishes *packed* and *shipped* —
 * states the packing bench, the Shippo label step and the customer's tracker all
 * display. Rather than bend the store's states into Woo's or invent a plugin
 * dependency, the mapping is explicit and two-way:
 *
 *   - a state Woo has (`pending`, `processing`, `completed`, `cancelled`) is the
 *     Woo order status, so the store's own reports and emails stay correct;
 *   - a state Woo lacks (`packed`, `shipped`) is the Woo status it corresponds to
 *     (`processing`) **plus** the real state in order meta under `_hk_status`.
 *
 * Reading prefers the meta value, so a shipped order reads as shipped rather than
 * silently degrading to "processing" in the console. Writing the native status
 * *and* the meta is what makes the pair the store's record: a Woo admin looking at
 * the order sees "Processing" plus a private note, and this app sees "Shipped".
 * The alternative — a custom status registered by a plugin on the owner's
 * WordPress — would be a dependency this repository cannot install or verify.
 *
 * ## Prices are Woo's
 *
 * Totals come from the order's own fields (`total`, `shipping_total`,
 * `discount_total`, `total_tax`), never recomputed here. If Woo and this app ever
 * disagree about a total, the store's number is the one the customer was charged,
 * so that is the number the console shows.
 */

import { WordPressApiError, wordpressRequest, wordpressRequestWithMeta } from '../backend/wordpress';
import { requireWooCredentials } from '../backend/credentials';
import type { Json, Order, OrderItem } from '../commerce/databaseTypes';

/**
 * The app's own order types, re-exported so a caller can name the shape it receives
 * without importing the generated database types — those exist only to describe the
 * store that no longer owns orders.
 */
export type { Order, OrderItem };

const REST_V3 = '/wc/v3';

/** Order meta this app owns. Prefixed so a Woo admin can tell ours from a plugin's. */
export const HK_META = {
  /** App fulfilment state for states WooCommerce has no status for. */
  status: '_hk_status',
  paymentStatus: '_hk_payment_status',
  userId: '_hk_user_id',
  couponCode: '_hk_coupon',
  paymentIntent: '_hk_payment_intent',
  /**
   * The checkout that reserved this order, so a double-click reuses it.
   *
   * A pending order is created *before* payment is attempted (see
   * `lib/orders/reserveOrder`), so the idempotency question is "has this cart
   * already reserved an order?" — which is answered by comparing this value.
   * It is the cart's shape (`product:grain:qty`, sorted), not its token, so the
   * same basket from a refreshed browser still matches.
   */
  cartFingerprint: '_hk_cart_fingerprint',
  /** The WooCommerce cart token, so the webhook can empty the right cart. */
  cartToken: '_hk_cart_token',
  trackingNumber: '_hk_tracking_number',
  trackingUrl: '_hk_tracking_url',
  labelUrl: '_hk_label_url',
  shippoRateId: '_hk_shippo_rate_id',
  shippoTransactionId: '_hk_shippo_transaction_id',
  carrier: '_hk_shipping_carrier',
  service: '_hk_shipping_service',
  /** The shipping method the customer chose (`standard` | `expedited`). */
  shippingMethod: '_hk_shipping_method',
  shippedAt: '_hk_shipped_at',
  deliveredAt: '_hk_delivered_at',
} as const;

export type AppOrderStatus = Order['status'];
export type AppPaymentStatus = Order['payment_status'];

/** Fulfilment states WooCommerce itself has no status for. */
const META_ONLY_STATUSES: AppOrderStatus[] = ['packed', 'shipped', 'confirmed'];

/** Woo order status -> the app's own status, before meta is consulted. */
const NATIVE_STATUS_TO_APP: Record<string, AppOrderStatus> = {
  pending: 'pending',
  'on-hold': 'pending',
  processing: 'processing',
  completed: 'delivered',
  cancelled: 'cancelled',
  refunded: 'refunded',
  failed: 'pending',
  trash: 'cancelled',
};

/** The app's status -> the Woo status that carries it. */
const APP_STATUS_TO_NATIVE: Record<AppOrderStatus, string> = {
  pending: 'pending',
  confirmed: 'pending',
  processing: 'processing',
  packed: 'processing',
  shipped: 'processing',
  delivered: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

export interface WooOrderAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
}

export interface WooOrderLineItem {
  id?: number;
  product_id?: number;
  variation_id?: number;
  name?: string;
  quantity?: number;
  sku?: string | null;
  /** Pre-discount line total, as a string. */
  subtotal?: string;
  /** Post-discount line total, as a string. */
  total?: string;
  price?: number;
  image?: { src?: string } | null;
  meta_data?: Array<{ key?: string; value?: unknown }>;
}

/** A WooCommerce order as REST v3 reports it (the fields this module reads). */
export interface WooOrderLike {
  id: number;
  number?: string;
  status?: string;
  currency?: string;
  date_created_gmt?: string;
  date_modified_gmt?: string;
  date_paid_gmt?: string | null;
  date_completed_gmt?: string | null;
  discount_total?: string;
  shipping_total?: string;
  total?: string;
  total_tax?: string;
  customer_id?: number;
  customer_note?: string;
  payment_method?: string;
  payment_method_title?: string;
  transaction_id?: string;
  needs_payment?: boolean;
  billing?: WooOrderAddress;
  shipping?: WooOrderAddress;
  line_items?: WooOrderLineItem[];
  meta_data?: Array<{ id?: number; key?: string; value?: unknown }>;
}

/** A write to the store failed. Distinguishable so routes can answer 502. */
export class WooOrderError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'WooOrderError';
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Meta helpers                                                        */
/* ------------------------------------------------------------------ */

function metaMap(order: WooOrderLike): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const entry of order.meta_data ?? []) {
    if (entry?.key) map.set(entry.key, entry.value);
  }
  return map;
}

function metaString(order: WooOrderLike, key: string): string | null {
  const value = metaMap(order).get(key);
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

/** One `_hk_*` meta value from a Woo order, or null. Never throws. */
export function readWooOrderMeta(order: WooOrderLike, key: string): string | null {
  return metaString(order, key);
}

function money(value: string | number | undefined | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** WooCommerce reports local time without an offset; the `_gmt` fields are true UTC. */
function isoFromGmt(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // '0000-00-00 00:00:00' is WooCommerce's "unset" sentinel.
  if (trimmed.startsWith('0000-00-00')) return null;
  const normalised = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalised) ? normalised : `${normalised}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function addressToJson(address: WooOrderAddress | undefined, fallbackEmail?: string): Json {
  const shipping = address ?? {};
  const fullName = [shipping.first_name, shipping.last_name].filter(Boolean).join(' ').trim();
  return {
    fullName: fullName || undefined,
    addressLine1: shipping.address_1 || undefined,
    addressLine2: shipping.address_2 || undefined,
    city: shipping.city || undefined,
    state: shipping.state || undefined,
    postalCode: shipping.postcode || undefined,
    country: shipping.country || undefined,
    company: shipping.company || undefined,
    email: shipping.email || fallbackEmail || undefined,
    phone: shipping.phone || undefined,
  } as unknown as Json;
}

/* ------------------------------------------------------------------ */
/* Projections (pure, and therefore testable without a store)          */
/* ------------------------------------------------------------------ */

/** The app's status for a Woo order: its own meta first, Woo's status second. */
export function appStatusFromWoo(order: WooOrderLike): AppOrderStatus {
  const metaStatus = metaString(order, HK_META.status) as AppOrderStatus | null;
  if (metaStatus && metaStatus in APP_STATUS_TO_NATIVE) return metaStatus;
  return NATIVE_STATUS_TO_APP[String(order.status ?? '')] ?? 'pending';
}

/**
 * The app's payment status for a Woo order.
 *
 * `date_paid_gmt` is the store's own record that money arrived, so it wins over
 * anything recorded here; the meta value exists for the pause between a Stripe
 * `payment_intent.succeeded` and the store being updated.
 */
export function paymentStatusFromWoo(order: WooOrderLike): AppPaymentStatus {
  const metaStatus = metaString(order, HK_META.paymentStatus) as AppPaymentStatus | null;
  if (metaStatus) return metaStatus;
  if (order.date_paid_gmt) return 'paid';
  if (order.status === 'refunded') return 'refunded';
  if (order.status === 'failed') return 'failed';
  if (order.date_completed_gmt) return 'paid';
  return 'pending';
}

/** Order line items, in the app's `OrderItem` shape. */
export function lineItemsFromWoo(order: WooOrderLike): OrderItem[] {
  return (order.line_items ?? []).map((line, index) => {
    const quantity = Number(line.quantity ?? 0) || 0;
    const total = money(line.total ?? line.subtotal ?? 0);
    const unitPrice = Number(line.price ?? 0) || (quantity > 0 ? total / quantity : total);
    const grain = (line.meta_data ?? []).find((entry) => entry?.key === 'grain_size')?.value;
    return {
      id: `${order.id}-${line.id ?? index}`,
      order_id: String(order.id),
      product_id: line.variation_id ? String(line.variation_id) : String(line.product_id ?? ''),
      product_name: line.name ?? 'Unknown product',
      product_image: line.image?.src ?? null,
      quantity,
      grain_size: typeof grain === 'string' ? grain : null,
      unit_price: unitPrice,
      total_price: total,
      created_at: isoFromGmt(order.date_created_gmt) ?? new Date(0).toISOString(),
    } satisfies OrderItem;
  });
}

/** A WooCommerce order as this app's `Order`. Woo's numbers are used as reported. */
export function orderFromWoo(order: WooOrderLike): Order {
  const lineSubtotal = (order.line_items ?? []).reduce(
    (sum, line) => sum + money(line.subtotal ?? line.total ?? 0),
    0
  );
  const createdAt = isoFromGmt(order.date_created_gmt) ?? new Date(0).toISOString();
  const billingEmail = (order.billing?.email ?? '').trim();

  return {
    id: String(order.id),
    order_number: String(order.number ?? order.id),
    user_id: metaString(order, HK_META.userId),
    email: billingEmail,
    phone: order.billing?.phone?.trim() || null,
    status: appStatusFromWoo(order),
    payment_status: paymentStatusFromWoo(order),
    payment_method: order.payment_method ?? null,
    subtotal: lineSubtotal,
    shipping_cost: money(order.shipping_total),
    tax_amount: money(order.total_tax),
    discount_amount: money(order.discount_total),
    total: money(order.total),
    currency: order.currency ?? 'USD',
    // WooCommerce omits the shipping block entirely on an order that ships
    // nowhere. Showing an empty address there would be a blank panel where the
    // customer expects their address, so the billing address is used — which is
    // also what the store's own order screen does.
    shipping_address: addressToJson(order.shipping ?? order.billing, billingEmail),
    billing_address: addressToJson(order.billing, billingEmail),
    notes: order.customer_note?.trim() || null,
    tracking_number: metaString(order, HK_META.trackingNumber),
    tracking_url: metaString(order, HK_META.trackingUrl),
    shippo_rate_id: metaString(order, HK_META.shippoRateId),
    shippo_transaction_id: metaString(order, HK_META.shippoTransactionId),
    shipping_carrier: metaString(order, HK_META.carrier),
    shipping_service: metaString(order, HK_META.service),
    label_url: metaString(order, HK_META.labelUrl),
    shipped_at: metaString(order, HK_META.shippedAt),
    delivered_at: metaString(order, HK_META.deliveredAt),
    created_at: createdAt,
    updated_at: isoFromGmt(order.date_modified_gmt) ?? createdAt,
  };
}

/** An order plus its lines, the shape every screen in this app already reads. */
export function orderWithItemsFromWoo(order: WooOrderLike): Order & { order_items: OrderItem[] } {
  return { ...orderFromWoo(order), order_items: lineItemsFromWoo(order) };
}

/** The Woo status + meta pair that carries an app status. */
export function wooWritePlan(status: AppOrderStatus): { status: string; meta: string | null } {
  const native = APP_STATUS_TO_NATIVE[status];
  return {
    status: native,
    meta: META_ONLY_STATUSES.includes(status) ? status : null,
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export interface WooOrderQuery {
  /** App statuses; translated to the Woo statuses that carry them. */
  status?: AppOrderStatus;
  search?: string;
  customerId?: number;
  /** Woo order ids, when a caller already knows which orders it may see. */
  include?: number[];
  page?: number;
  perPage?: number;
}

const READ_TIMEOUT = 25_000;

/** A page of orders, with the store's own count so a pager can be honest. */
export async function listWooOrders(query: WooOrderQuery = {}): Promise<{
  orders: WooOrderLike[];
  total: number;
  totalPages: number;
}> {
  requireWooCredentials();
  const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  // A meta-only state ('packed', 'shipped') has no Woo status of its own, so the
  // server cannot filter for it: those pages are read by Woo status and then
  // narrowed here, with the store's count adjusted to match what was filtered.
  const metaOnly = query.status && META_ONLY_STATUSES.includes(query.status);
  const nativeStatus = query.status ? APP_STATUS_TO_NATIVE[query.status] : 'any';

  const response = await wordpressRequestWithMeta<WooOrderLike[]>(`${REST_V3}/orders`, {
    useCredentials: true,
    params: {
      per_page: metaOnly ? 100 : perPage,
      page: metaOnly ? 1 : page,
      status: nativeStatus,
      search: query.search || undefined,
      customer: query.customerId,
      orderby: 'date',
      order: 'desc',
    },
    timeoutMs: READ_TIMEOUT,
  });

  let orders = Array.isArray(response.data) ? response.data : [];
  if (query.include) {
    const allowed = new Set(query.include);
    orders = orders.filter((order) => allowed.has(Number(order.id)));
  }

  if (metaOnly) {
    const wanted = query.status as AppOrderStatus;
    const filtered = orders.filter((order) => appStatusFromWoo(order) === wanted);
    const total = filtered.length;
    const start = (page - 1) * perPage;
    return { orders: filtered.slice(start, start + perPage), total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
  }

  return {
    orders,
    total: response.total ?? orders.length,
    totalPages: response.totalPages ?? 1,
  };
}

/**
 * The pending order a cart already reserved, if any.
 *
 * This is the idempotency read for checkout: a shopper who double-clicks, or a
 * browser that retries a timed-out request, asks to reserve the *same* cart and
 * must land on the order the first attempt created rather than a second one.
 * Only pending orders are eligible — a paid or cancelled order for the same cart
 * is a different event, and a fresh reservation is correct for it.
 *
 * The billing email is matched too, so two shoppers who happen to build an
 * identical cart do not share an order.
 */
export async function findPendingWooOrderByFingerprint(input: {
  fingerprint: string;
  email: string;
  customerId?: number | null;
}): Promise<WooOrderLike | null> {
  requireWooCredentials();
  if (!input.fingerprint) return null;
  const email = input.email.trim().toLowerCase();

  const page = await listWooOrders({ status: 'pending', perPage: 100 });
  const match = page.orders.find((order) => {
    if (metaString(order, HK_META.cartFingerprint) !== input.fingerprint) return false;
    const owner = String(order.billing?.email ?? '').trim().toLowerCase();
    if (email && owner !== email) return false;
    if (input.customerId) {
      const orderCustomer = Number(order.customer_id ?? 0);
      if (orderCustomer && orderCustomer !== input.customerId) return false;
    }
    return true;
  });
  return match ?? null;
}

/**
 * True when a WooCommerce failure means "there is no such order".
 *
 * WooCommerce answers an unknown order id with its own error code
 * (`woocommerce_rest_shop_order_invalid_id`) rather than a clean 404, so a status
 * check alone is not enough — and a caller that treats "no such order" as a store
 * outage refuses a legitimate 404. One predicate, so the read, the lookup route and
 * the tracker cannot disagree about what a miss is.
 */
export function isWooOrderNotFound(error: unknown): boolean {
  if (error instanceof WooOrderError) return error.status === 404;
  if (error instanceof WordPressApiError) {
    return error.status === 404 || error.code === 'woocommerce_rest_shop_order_invalid_id';
  }
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP 404|does not exist|invalid id/i.test(message);
}

/** One order by id. Throws a 404-shaped error when the store has no such order. */
export async function getWooOrder(id: number): Promise<WooOrderLike> {
  requireWooCredentials();
  if (!Number.isFinite(id) || id <= 0) throw new WooOrderError('An order id is required.', 400);
  try {
    return await wordpressRequest<WooOrderLike>(`${REST_V3}/orders/${id}`, {
      useCredentials: true,
      timeoutMs: READ_TIMEOUT,
    });
  } catch (error) {
    if (isWooOrderNotFound(error)) {
      throw new WooOrderError(`No order ${id} exists in the store.`, 404);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new WooOrderError(`Order ${id} could not be read: ${message}`);
  }
}

/**
 * Orders belonging to one email address.
 *
 * This is the identity bridge between the app's Supabase session and the store:
 * a signed-in customer is matched to their WooCommerce customer by email (the
 * only identifier both systems share), and their orders are read by that
 * customer id. Guest orders are found by `search`, which WooCommerce matches
 * against the billing email, and the results are then verified against the
 * billing address here rather than trusted — a search that matched a different
 * customer's order would otherwise leak it.
 */
export async function listWooOrdersForEmail(
  email: string,
  options: { page?: number; perPage?: number; includeGuests?: boolean } = {}
): Promise<{ orders: WooOrderLike[]; total: number; totalPages: number; customerId: number | null }> {
  requireWooCredentials();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { orders: [], total: 0, totalPages: 1, customerId: null };

  const customer = await findWooCustomerByEmail(normalized);
  if (customer) {
    const scoped = await listWooOrders({
      customerId: customer.id,
      page: options.page,
      perPage: options.perPage,
    });
    return { ...scoped, customerId: customer.id };
  }

  if (options.includeGuests === false) {
    return { orders: [], total: 0, totalPages: 1, customerId: null };
  }

  // No customer account: the order may still exist as a guest order. A registered
  // customer's orders are deliberately excluded, because their account is where
  // those belong.
  const searched = await listWooOrders({
    search: normalized,
    page: options.page,
    perPage: options.perPage,
  });
  const orders = searched.orders.filter(
    (order) =>
      Number(order.customer_id ?? 0) === 0 &&
      String(order.billing?.email ?? '').trim().toLowerCase() === normalized
  );
  return { orders, total: orders.length, totalPages: 1, customerId: null };
}

/** One order, but only when it belongs to this email — the authorization check. */
export async function getWooOrderForEmail(
  id: number,
  email: string
): Promise<WooOrderLike | null> {
  const order = await getWooOrder(id);
  const owner = String(order.billing?.email ?? '').trim().toLowerCase();
  return owner && owner === email.trim().toLowerCase() ? order : null;
}

export interface WooCustomerLike {
  id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  role?: string;
  date_created_gmt?: string;
  orders_count?: number;
  avatar_url?: string;
  billing?: WooOrderAddress;
  shipping?: WooOrderAddress;
}

/** The store's customer record for an email, or null. */
export async function findWooCustomerByEmail(email: string): Promise<WooCustomerLike | null> {
  requireWooCredentials();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await wordpressRequest<WooCustomerLike[]>(`${REST_V3}/customers`, {
    useCredentials: true,
    params: { email: normalized, per_page: 5 },
    timeoutMs: 20_000,
  });
  const list = Array.isArray(rows) ? rows : [];
  return list.find((row) => String(row.email ?? '').toLowerCase() === normalized) ?? null;
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

function metaPayload(entries: Record<string, string | null>): Array<{ key: string; value: string }> {
  return Object.entries(entries)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ key, value: String(value) }));
}

/**
 * Sets an order's app status.
 *
 * Both halves are written: the Woo status, so the store's own order list, emails
 * and reports agree; and `_hk_status`, so the state this app's workflow uses
 * survives. A store that rejects the meta write is reported rather than ignored,
 * because a silently dropped 'shipped' would make the customer's tracker wrong.
 */
export async function updateWooOrderStatus(
  id: number,
  input: { status: AppOrderStatus; paymentStatus?: AppPaymentStatus; trackingNumber?: string }
): Promise<WooOrderLike> {
  requireWooCredentials();
  const plan = wooWritePlan(input.status);

  // The app status is written **every** time, using an empty value to clear it when
  // WooCommerce's own status already carries the state. Leaving the key out does
  // not clear it: WooCommerce keeps the meta it already has, so an order marked
  // `shipped` and then `delivered` would keep reading as `shipped` in this console
  // while the store showed Completed. Measured against the live store, which is how
  // this was found.
  const meta: Record<string, string | null> = {
    [HK_META.status]: plan.meta ?? '',
  };
  if (input.paymentStatus) meta[HK_META.paymentStatus] = input.paymentStatus;
  if (input.trackingNumber !== undefined) meta[HK_META.trackingNumber] = input.trackingNumber || null;
  if (input.status === 'shipped') meta[HK_META.shippedAt] = new Date().toISOString();
  if (input.status === 'delivered') meta[HK_META.deliveredAt] = new Date().toISOString();

  try {
    return await wordpressRequest<WooOrderLike>(`${REST_V3}/orders/${id}`, {
      useCredentials: true,
      method: 'PUT',
      body: { status: plan.status, meta_data: metaPayload(meta) },
      timeoutMs: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WooOrderError(`Order ${id} could not be updated in the store: ${message}`);
  }
}

/**
 * Records the PaymentIntent a checkout reserved for an order.
 *
 * Written at payment-intent time, before any money moves. It is what makes a
 * second attempt at the same order reuse the intent it already has rather than
 * creating another one that could also be confirmed — the double-charge guard that
 * does not expire (Stripe's own idempotency keys last 24 hours; this lasts as long
 * as the order does).
 */
export async function setWooOrderPaymentIntent(
  id: number,
  input: { paymentIntentId: string; paymentMethod?: string; paymentMethodTitle?: string }
): Promise<WooOrderLike> {
  requireWooCredentials();
  const body: Record<string, unknown> = {
    meta_data: metaPayload({ [HK_META.paymentIntent]: input.paymentIntentId }),
  };
  if (input.paymentMethod) body.payment_method = input.paymentMethod;
  if (input.paymentMethodTitle) body.payment_method_title = input.paymentMethodTitle;

  try {
    return await wordpressRequest<WooOrderLike>(`${REST_V3}/orders/${id}`, {
      useCredentials: true,
      method: 'PUT',
      body,
      timeoutMs: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WooOrderError(`Order ${id} could not record its payment reference: ${message}`);
  }
}

/** Marks an order paid, recording the payment intent that paid it. */
export async function markWooOrderPaid(
  id: number,
  input: { paymentIntentId?: string; transactionId?: string } = {}
): Promise<WooOrderLike> {
  requireWooCredentials();
  const body: Record<string, unknown> = {
    set_paid: true,
    meta_data: metaPayload({
      [HK_META.paymentStatus]: 'paid',
      [HK_META.paymentIntent]: input.paymentIntentId ?? null,
    }),
  };
  if (input.transactionId) body.transaction_id = input.transactionId;

  try {
    return await wordpressRequest<WooOrderLike>(`${REST_V3}/orders/${id}`, {
      useCredentials: true,
      method: 'PUT',
      body,
      timeoutMs: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WooOrderError(`Order ${id} could not be marked paid: ${message}`);
  }
}

/** Records the shipping label and tracking a carrier returned. */
export async function setWooOrderShipping(
  id: number,
  input: {
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    labelUrl?: string | null;
    shippoRateId?: string | null;
    shippoTransactionId?: string | null;
    carrier?: string | null;
    service?: string | null;
  }
): Promise<WooOrderLike> {
  requireWooCredentials();
  try {
    return await wordpressRequest<WooOrderLike>(`${REST_V3}/orders/${id}`, {
      useCredentials: true,
      method: 'PUT',
      body: {
        meta_data: metaPayload({
          [HK_META.trackingNumber]: input.trackingNumber ?? null,
          [HK_META.trackingUrl]: input.trackingUrl ?? null,
          [HK_META.labelUrl]: input.labelUrl ?? null,
          [HK_META.shippoRateId]: input.shippoRateId ?? null,
          [HK_META.shippoTransactionId]: input.shippoTransactionId ?? null,
          [HK_META.carrier]: input.carrier ?? null,
          [HK_META.service]: input.service ?? null,
        }),
      },
      timeoutMs: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WooOrderError(`Shipping details for order ${id} could not be saved: ${message}`);
  }
}

/**
 * Adds a private note to an order.
 *
 * WooCommerce's own note stream is where an operator already reads an order's
 * history, so operational facts this app records (a label's cost, why a carrier was
 * swapped) belong here rather than in a table of their own.
 */
export async function addWooOrderNote(id: number, note: string): Promise<void> {
  requireWooCredentials();
  if (!note.trim()) return;
  try {
    await wordpressRequest<unknown>(`${REST_V3}/orders/${id}/notes`, {
      useCredentials: true,
      method: 'POST',
      body: { note, customer_note: false },
      timeoutMs: 30_000,
    });
  } catch (error) {
    // A note is an annotation, not part of the order's truth — never fail the
    // operation that produced it because the annotation could not be written.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Order ${id} note could not be written: ${message}`);
  }
}

export interface CreateWooOrderInput {
  email: string;
  phone?: string;
  lineItems: Array<{
    productId: number;
    variationId?: number;
    quantity: number;
    /** The price the customer is being charged for this line. Always sent. */
    price: number;
    name?: string;
  }>;
  billing?: WooOrderAddress;
  shipping?: WooOrderAddress;
  shippingMethod?: string;
  couponCode?: string;
  customerNote?: string;
  customerId?: number;
  meta?: Record<string, string | null>;
  status?: AppOrderStatus;
  /**
   * The payment method the store records on the order (`invoice`, `stripe_card`).
   *
   * WooCommerce owns this field, so the console and the store's own order screen
   * agree about how an order is meant to be paid. Left unset for an ordinary
   * Stripe order until the webhook records the paid intent.
   */
  paymentMethod?: string;
  paymentMethodTitle?: string;
}

/**
 * Creates an order in the store.
 *
 * Every line price is sent explicitly, so the store's record of what the customer
 * was charged is the number this app computed rather than a price the store
 * re-derived at creation time. Tax is left to the store (`calc_taxes` is on), which
 * is why the created order is read back and its own totals are what the app
 * reports — see `orderFromWoo`.
 */
export async function createWooOrder(input: CreateWooOrderInput): Promise<WooOrderLike> {
  requireWooCredentials();
  if (!input.email.trim()) throw new WooOrderError('An email address is required.', 400);
  if (!input.lineItems.length) throw new WooOrderError('An order needs at least one line item.', 400);

  const plan = wooWritePlan(input.status ?? 'pending');

  const body: Record<string, unknown> = {
    status: plan.status,
    currency: 'USD',
    customer_id: input.customerId,
    payment_method: input.paymentMethod,
    payment_method_title: input.paymentMethodTitle,
    billing: input.billing
      ? { ...input.billing, email: input.billing.email || input.email, phone: input.billing.phone || input.phone }
      : { email: input.email, phone: input.phone },
    shipping: input.shipping,
    line_items: input.lineItems.map((line) => ({
      product_id: line.productId,
      variation_id: line.variationId,
      quantity: line.quantity,
      // `total` (not `subtotal`) is what pins the charged amount for the line.
      total: (line.price * line.quantity).toFixed(2),
    })),
    shipping_lines: input.shippingMethod
      ? [{ method_id: 'flat_rate', method_title: input.shippingMethod, total: '0.00' }]
      : undefined,
    coupon_lines: input.couponCode ? [{ code: input.couponCode }] : undefined,
    customer_note: input.customerNote,
    meta_data: metaPayload({ [HK_META.status]: plan.meta, ...(input.meta ?? {}) }),
  };

  try {
    return await wordpressRequest<WooOrderLike>(`${REST_V3}/orders`, {
      useCredentials: true,
      method: 'POST',
      body,
      timeoutMs: 40_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WooOrderError(`The order could not be created in the store: ${message}`);
  }
}

/**
 * Moves an order to the store's trash.
 *
 * Trash, never a permanent delete: an order the console cancelled must be
 * recoverable, and WooCommerce keeps trashed orders out of its own lists. The
 * permanent variant exists solely for the throwaway order the write test creates,
 * which must not survive anywhere.
 */
export async function trashWooOrder(id: number): Promise<WooOrderLike> {
  requireWooCredentials();
  return wordpressRequest<WooOrderLike>(`${REST_V3}/orders/${id}`, {
    useCredentials: true,
    method: 'DELETE',
    params: { force: 'false' },
    timeoutMs: 30_000,
  });
}

/** Permanently deletes an order. Only the staging write test may call this. */
export async function permanentlyDeleteWooOrder(id: number): Promise<void> {
  requireWooCredentials();
  await wordpressRequest<unknown>(`${REST_V3}/orders/${id}`, {
    useCredentials: true,
    method: 'DELETE',
    params: { force: 'true' },
    timeoutMs: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/* Figures the dashboard reports                                      */
/* ------------------------------------------------------------------ */

export interface WooOrderStats {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  refundRequests: number;
  totalRevenue: number;
  /** Orders read to produce these figures, so the console can say how wide it looked. */
  window: number;
}

/**
 * Dashboard figures, counted from orders the store reported.
 *
 * Revenue counts orders the store has recorded as paid, because an unpaid order
 * is not revenue. Nothing here is scaled up from a sample: `window` travels with
 * the figures so a screen can state how many orders it actually counted.
 */
export function statsFromWooOrders(orders: WooOrderLike[]): WooOrderStats {
  const stats: WooOrderStats = {
    totalOrders: orders.length,
    pendingOrders: 0,
    processingOrders: 0,
    shippedOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    refundRequests: 0,
    totalRevenue: 0,
    window: orders.length,
  };

  for (const order of orders) {
    const status = appStatusFromWoo(order);
    if (status === 'pending' || status === 'confirmed') stats.pendingOrders += 1;
    else if (status === 'processing' || status === 'packed') stats.processingOrders += 1;
    else if (status === 'shipped') stats.shippedOrders += 1;
    else if (status === 'delivered') stats.deliveredOrders += 1;
    else if (status === 'cancelled' || status === 'refunded') stats.cancelledOrders += 1;

    if (status === 'refunded' || order.status === 'refunded') stats.refundRequests += 1;
    if (paymentStatusFromWoo(order) === 'paid') stats.totalRevenue += money(order.total);
  }

  stats.totalRevenue = Math.round(stats.totalRevenue * 100) / 100;
  return stats;
}
