
import {
  HK_META,
  createWooOrder,
  findPendingWooOrderByFingerprint,
  orderWithItemsFromWoo,
  type WooOrderLike,
} from '@/lib/woo/orders';
import { clearStoreCart, mapStoreCart, readStoreCart, type StoreCartLine } from '@/lib/woo/storeCart';
import type { CreateOrderData, ShippingMethod } from '@/lib/orders/totals';
import type { OrderWithItems } from '@/lib/supabase/database.types';
import { resolveShippoConfigError } from '@/lib/shippo/config';
import { fetchShippoRatesForOrder, pickRateForShippingMethod } from '@/lib/shippo/server/rates';
import type { CheckoutShippingAddress, RatesLineItem } from '@/lib/shippo/types';

/**
 * Authoritative server-side shipping cost. The client-supplied
 * `shippingCostOverride` is NEVER trusted for money math — a tampered request
 * could otherwise set shipping to $0. When Shippo is configured we re-fetch
 * live rates and use the amount for the customer's chosen rate (matched by
 * shippoRateId, else picked by shipping method). If Shippo is not configured or
 * returns no rates, we fall back to the flat-rate table in calculateOrderTotals
 * (which ignores the override when we pass undefined).
 */
export async function resolveServerShippingCost(params: {
  shippingAddress: CreateOrderData['shippingAddress'];
  email: string;
  shippingMethod: ShippingMethod;
  shippoRateId?: string;
  lineItems: RatesLineItem[];
}): Promise<{ shippingCostOverride: number | undefined; shippoRateId: string | null; carrier: string | null; service: string | null }> {
  const configError = await resolveShippoConfigError();
  if (configError) {
    // Shippo off — flat-rate fallback, ignore any client override entirely.
    return { shippingCostOverride: undefined, shippoRateId: null, carrier: null, service: null };
  }

  try {
    const rates = await fetchShippoRatesForOrder({
      email: params.email,
      shippingAddress: params.shippingAddress as CheckoutShippingAddress,
      lineItems: params.lineItems,
    });
    const chosen = pickRateForShippingMethod(rates, params.shippingMethod, params.shippoRateId || null);
    if (chosen) {
      return {
        shippingCostOverride: chosen.amount,
        shippoRateId: chosen.objectId,
        carrier: chosen.provider,
        service: chosen.serviceName,
      };
    }
  } catch (error) {
    console.error('[Order] Server-side Shippo rate verification failed, using flat rate:', error);
  }
  // No usable live rate — flat-rate fallback, still ignoring client override.
  return { shippingCostOverride: undefined, shippoRateId: null, carrier: null, service: null };
}

/**
 * A cart line, as the checkout guards need to see it.
 *
 * Structural rather than the old Supabase row type: the cart is WooCommerce's
 * now, and these guards ask questions about *shape* — is the product still
 * sellable, is the quantity available, what does the line cost — not about which
 * database stored it. Keeping the type local is what let the read move to
 * WooCommerce while the guards, and the tests that pin them, stayed put.
 */
export interface CheckoutCartItem {
  id: string;
  product_id: string;
  quantity: number;
  grain_size: string | null;
  unit_price: number;
  product: {
    id: string;
    name: string;
    price: number;
    thumbnail?: string | null;
    is_active: boolean;
    tags?: string[] | null;
    inventory?: {
      track_inventory?: boolean;
      allow_backorder?: boolean;
      quantity?: number;
      reserved_quantity?: number;
    } | null;
  } | null;
}

/** A cart, as the checkout needs it. `id` is the WooCommerce cart token. */
export interface CheckoutCart {
  id: string;
  cart_items: CheckoutCartItem[];
}

/**
 * Every cart line that must not be charged for, judged from the cart alone.
 *
 * Prices are no longer readable from the cart and trusted: they *are* the cart's
 * prices. WooCommerce prices each line when it is added, so the browser no longer
 * writes a unit price anywhere — the client-writable `cart_items.unit_price` this
 * comment used to warn about is gone with the table.
 */
export function checkoutCartIssues(
  cartItems: CheckoutCartItem[],
): Array<{ cartItemId: string; message: string }> {
  const issues: Array<{ cartItemId: string; message: string }> = [];
  for (const item of cartItems) {
    const product = item.product as any;
    if (!product) {
      issues.push({ cartItemId: item.id, message: 'This product is no longer available.' });
      continue;
    }
    if (!product.is_active) {
      issues.push({ cartItemId: item.id, message: `${product.name || 'This product'} is unavailable.` });
      continue;
    }
    const inventory = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
    if (inventory?.track_inventory && !inventory.allow_backorder) {
      const available = Math.max(0, Number(inventory.quantity || 0) - Number(inventory.reserved_quantity || 0));
      if (Number(item.quantity) > available) {
        issues.push({ cartItemId: item.id, message: `${product.name || 'This product'} has only ${available} available.` });
      }
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      issues.push({ cartItemId: item.id, message: 'Cart quantities must be positive whole numbers.' });
    }
  }
  return issues;
}

export function validateCheckoutCartItems(
  cartItems: CheckoutCartItem[],
): void {
  const issues = checkoutCartIssues(cartItems);
  if (issues.length > 0) {
    throw new Error(`${issues[0].message} Remove it or adjust the quantity and try again.`);
  }
}

export function priceCartItems(cartItems: CheckoutCartItem[]) {
  validateCheckoutCartItems(cartItems);
  return cartItems.map((item) => {
    const product = item.product;
    if (!product) {
      throw new Error('One of the items in your cart is no longer available. Please remove it and try again.');
    }
    return { ...item, unitPrice: Number(product.price) };
  });
}

export function cartFingerprint(cartItems: CheckoutCartItem[]): string {
  return cartItems
    .map((item) => `${item.product_id}:${item.grain_size || ''}:${item.quantity}`)
    .sort()
    .join('|');
}

/**
 * The cart, read from WooCommerce.
 *
 * `cartToken` is the value of the cart cookie (`lib/cart/cookies.ts`). The Stripe
 * webhook has no browser and therefore no cookie, which is why the token rather
 * than the cookie is what identifies the cart here: the reserved Woo order records
 * it, and the webhook reads it back when the payment succeeds.
 *
 * Null means "no cart", the same answer the previous Supabase read gave for a
 * missing row, so every caller's empty-cart handling is unchanged.
 */
export async function loadCartForCheckout(cartToken: string | null): Promise<CheckoutCart | null> {
  if (!cartToken) return null;

  const { cart } = await readStoreCart({ cartToken, nonce: null });
  const view = mapStoreCart(cart);
  if (!view.items.length) return null;

  return { id: cartToken, cart_items: view.items.map(toCheckoutItem) };
}

/**
 * A WooCommerce cart line, in the shape the guards and the order writer expect.
 *
 * `price` is the line's own price rather than a fresh catalog read: it is what
 * WooCommerce will charge, and a second opinion read from the catalog is how a
 * cart and the checkout that charges it start disagreeing.
 */
function toCheckoutItem(line: StoreCartLine): CheckoutCartItem {
  return {
    id: line.key,
    product_id: line.productId,
    quantity: line.quantity,
    // A WooCommerce cart line carries no grain size — see
    // docs/STOREFRONT-WORDPRESS-CONTRACT.md for why the storefront's grain
    // selector cannot reach a WooCommerce cart.
    grain_size: null,
    unit_price: line.unitPrice ?? 0,
    product: {
      id: line.productId,
      name: line.name,
      price: line.unitPrice ?? 0,
      thumbnail: line.image || null,
      // The store is holding this line in its own cart, so it considers the
      // product purchasable. Stock is left unknown on purpose: WooCommerce owns
      // the count and enforces it when the order is written.
      is_active: true,
      tags: null,
      inventory: null,
    },
  };
}

export interface ReserveOrderOptions {
  /**
   * The WooCommerce customer id, taken from the verified session — never from the
   * request body. Null is a guest, and a supported path.
   */
  customerId: number | null;
  /** The WooCommerce cart token, recorded so the webhook can empty the cart. */
  cartToken: string | null;
  /**
   * The payment method to record up front. Set for an invoice order (there is no
   * payment to wait for); left unset for Stripe, where the webhook records how the
   * order was actually paid.
   */
  paymentMethod?: string;
  paymentMethodTitle?: string;
}

export interface ReservedOrder {
  order: OrderWithItems;
  /**
   * The store's own order record, for callers that need its meta (the payment
   * reference, the cart token) rather than the projection the screens render.
   */
  raw: WooOrderLike;
  /** True when this call reused the pending order an earlier attempt created. */
  reused: boolean;
  /** The cart token the reservation recorded, when there was a cart. */
  cartToken: string | null;
}

/**
 * Reserves the WooCommerce order for a checkout, once per cart.
 *
 * ## Why the order exists before the payment
 *
 * The store's order id is the identifier every later step needs — Stripe metadata,
 * the webhook, the tracking page, the customer's history — so it is created first
 * and the payment is attached to it. That also makes idempotency a property of the
 * store rather than of a session row this app has to keep: a second attempt at the
 * same cart finds the pending order the first attempt reserved (matched on
 * `_hk_cart_fingerprint`) and reuses it, so a double-click cannot become two
 * orders. Nothing here touches Supabase.
 *
 * ## What the server decides
 *
 * The cart is read from WooCommerce and priced from its own lines, the shipping
 *amount is re-quoted server-side, and the identity is the customer id the caller's
 * session proved. Every number on the order is the store's.
 *
 * The cart is **not** emptied here: an abandoned payment must leave the shopper's
 * cart intact. The webhook empties it once the money is confirmed.
 */
export async function reserveOrderForCheckout(
  data: CreateOrderData,
  options: ReserveOrderOptions
): Promise<ReservedOrder> {
  const cart = await loadCartForCheckout(options.cartToken);

  if (!cart || !cart.cart_items?.length) {
    throw new Error('Cart is empty. Add products again and retry checkout.');
  }

  const pricedItems = priceCartItems(cart.cart_items);
  const fingerprint = cartFingerprint(cart.cart_items);

  // A previous attempt at this same cart may already hold a pending order.
  const existing = await findPendingWooOrderByFingerprint({
    fingerprint,
    email: data.email,
    customerId: options.customerId,
  });
  if (existing) {
    return {
      order: orderWithItemsFromWoo(existing) as OrderWithItems,
      raw: existing,
      reused: true,
      cartToken: cart.id,
    };
  }

  // Recompute shipping server-side; never trust data.shippingCostOverride.
  const shippingMethod = (data.shippingMethod || 'standard') as ShippingMethod;
  const resolvedShipping = await resolveServerShippingCost({
    shippingAddress: data.shippingAddress,
    email: data.email,
    shippingMethod,
    shippoRateId: data.shippoRateId,
    lineItems: pricedItems.map((item) => ({
      productId: item.product_id ?? undefined,
      quantity: item.quantity,
    })),
  });

  const wooOrder = await createWooOrder({
    email: data.email,
    phone: data.phone,
    billing: {
      first_name: data.billingAddress?.fullName?.split(' ')[0] || data.shippingAddress.fullName.split(' ')[0] || '',
      last_name: data.billingAddress?.fullName?.split(' ').slice(1).join(' ') || data.shippingAddress.fullName.split(' ').slice(1).join(' ') || '',
      address_1: data.billingAddress?.addressLine1 || data.shippingAddress.addressLine1,
      address_2: data.billingAddress?.addressLine2 || data.shippingAddress.addressLine2,
      city: data.billingAddress?.city || data.shippingAddress.city,
      state: data.billingAddress?.state || data.shippingAddress.state,
      postcode: data.billingAddress?.postalCode || data.shippingAddress.postalCode,
      country: data.billingAddress?.country || data.shippingAddress.country || 'US',
      email: data.email,
      phone: data.phone,
    },
    shipping: {
      first_name: data.shippingAddress.fullName.split(' ')[0] || '',
      last_name: data.shippingAddress.fullName.split(' ').slice(1).join(' ') || '',
      address_1: data.shippingAddress.addressLine1,
      address_2: data.shippingAddress.addressLine2,
      city: data.shippingAddress.city,
      state: data.shippingAddress.state,
      postcode: data.shippingAddress.postalCode,
      country: data.shippingAddress.country || 'US',
    },
    lineItems: pricedItems.map((item) => ({
      productId: Number(item.product_id),
      quantity: item.quantity,
      price: item.unitPrice,
    })),
    shippingMethod,
    couponCode: data.couponCode,
    customerNote: data.notes,
    // The store's own customer record, so the order appears under the customer in
    // WooCommerce's admin — not only in this app's meta.
    customerId: options.customerId ?? undefined,
    status: 'pending',
    paymentMethod: options.paymentMethod,
    paymentMethodTitle: options.paymentMethodTitle,
    meta: {
      [HK_META.userId]: options.customerId ? String(options.customerId) : null,
      [HK_META.cartFingerprint]: fingerprint,
      [HK_META.cartToken]: cart.id,
      [HK_META.shippoRateId]: resolvedShipping.shippoRateId,
      [HK_META.carrier]: resolvedShipping.carrier ?? data.shippingCarrier ?? null,
      [HK_META.service]: resolvedShipping.service ?? data.shippingService ?? null,
      // Recorded so the label step knows which rate/speed the customer paid for;
      // it is a fact about the order, not about the checkout that made it.
      [HK_META.shippingMethod]: shippingMethod,
    },
  });

  return {
    order: orderWithItemsFromWoo(wooOrder) as OrderWithItems,
    raw: wooOrder,
    reused: false,
    cartToken: cart.id,
  };
}

/**
 * Empties the cart a reserved order was placed from.
 *
 * Called by the webhook once payment is confirmed, and by the invoice route once
 * the order exists. Best-effort on purpose: a cart that fails to clear must not
 * turn a paid order into an error the customer sees.
 */
export async function clearReservedCart(cartToken: string | null): Promise<void> {
  if (!cartToken) return;
  try {
    await clearStoreCart({ cartToken, nonce: null });
  } catch (error) {
    console.error('[Order] The cart could not be emptied after checkout:', error);
  }
}
