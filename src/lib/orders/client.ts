/**
 * The browser's order client: place an order, read one back.
 *
 * Both calls go through this app's own routes (`/api/orders/create`,
 * `/api/orders/get`) rather than to a database client, so the customer's signed
 * session is the only credential that travels and the price the server charges
 * is not the price the browser sent. They previously lived in
 * `lib/supabase/api/orders.ts`, next to Supabase queries and under a
 * module-level Supabase import — so the checkout, success and confirmation pages
 * downloaded the whole SDK to make two `fetch` calls.
 *
 * The arithmetic those pages also need is in `./totals`; the server-side order
 * storage this app still reads for `/api/orders/get` is not imported here and
 * stays on the server.
 */

import { getCustomerAccessToken } from '@/lib/auth/customerClient';
import type { OrderWithItems } from '@/lib/supabase/database.types';
import type { CreateOrderData } from './totals';

async function createOrderViaApi(data: CreateOrderData): Promise<OrderWithItems> {
  // The customer's own signed session, when there is one. A guest checkout sends
  // no credential — the route is written for both. No user id travels in the body:
  // the route derives it from this credential, so a browser cannot choose whose
  // order it is placing.
  const token = getCustomerAccessToken();

  const response = await fetch('/api/orders/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // No cart identifier travels with this request either: the cart is the cookie
    // the server already holds, so there is nothing here a caller could point at
    // somebody else's basket.
    body: JSON.stringify(data),
  });

  const body = (await response.json().catch(() => ({}))) as OrderWithItems & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Unable to place order (${response.status}).`);
  }
  return body;
}

async function getOrderByIdViaApi(orderId: string): Promise<OrderWithItems | null> {
  const token = getCustomerAccessToken();

  const response = await fetch('/api/orders/get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ orderId }),
  });

  if (response.status === 404) return null;

  const body = (await response.json().catch(() => ({}))) as OrderWithItems & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Unable to load order (${response.status}).`);
  }
  return body;
}

export const ordersApi = {
  /**
   * Places an invoice order — one billed separately, with no card payment.
   *
   * Card orders are not placed from here: the card checkout reserves its
   * WooCommerce order before the PaymentIntent exists, and the signed webhook
   * marks it paid. This is the remaining caller, and `userId` is deliberately
   * absent from its signature — the server takes the identity from the session.
   */
  async createOrder(data: CreateOrderData): Promise<OrderWithItems> {
    if (typeof window === 'undefined') {
      throw new Error('Orders are placed from the checkout page, not from the server.');
    }
    return createOrderViaApi(data);
  },

  /**
   * Reads one order back, by id.
   *
   * Client-side only: the route that serves it is written for a browser that
   * already knows the order id (guest confirmation pages have no session at all).
   * The server decides whether the caller may see it — a signed-in caller only
   * gets their own order, a guest only an ownerless one.
   */
  async getOrderById(orderId: string): Promise<OrderWithItems | null> {
    if (typeof window === 'undefined') return null;
    return getOrderByIdViaApi(orderId);
  },
};
