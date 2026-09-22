/**
 * Order lookup for the confirmation and success pages.
 *
 * ## WooCommerce first, and the caller's session decides
 *
 * The order is the store's. A **signed-in** caller only ever gets an order that is
 * theirs — matched on the WooCommerce customer id the session carries, or on the
 * billing email the store recorded. A **guest** caller (no verified session) only
 * ever gets an ownerless order: the guest-checkout-confirmation capability, without
 * the old RLS policy that let anyone holding the public anon key enumerate every
 * guest order.
 *
 * The caller cannot name an owner: there is no user id in the request body any
 * more, only the id of the order being asked about.
 *
 * ## Legacy fallback
 *
 * A pre-migration order is not in the store, so a Woo miss falls through to the
 * read-only legacy adapter (`lib/orders/legacyOrders`), which applies the same
 * ownership rule by billing email. A live order never reaches it.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { optionalCustomerRequest } from '@/lib/auth/customerRequest';
import {
  HK_META,
  getWooOrder,
  isWooOrderNotFound,
  orderWithItemsFromWoo,
  readWooOrderMeta,
  type WooOrderLike,
} from '@/lib/woo/orders';
import { getLegacyOrderForViewer } from '@/lib/orders/legacyOrders';

export const dynamic = 'force-dynamic';

/** Whether this viewer owns this Woo order, or may see it as a guest. */
function mayViewWooOrder(order: WooOrderLike, viewer: { id: number; email: string } | null): boolean {
  const owner = String(order.billing?.email ?? '').trim().toLowerCase();
  if (viewer) {
    if (Number(order.customer_id ?? 0) === viewer.id) return true;
    return Boolean(owner) && owner === viewer.email.trim().toLowerCase();
  }
  // No session: ownerless only. A registered customer's order is not a guest order.
  const hasCustomer = Number(order.customer_id ?? 0) > 0;
  const hasMetaOwner = readWooOrderMeta(order, HK_META.userId) !== null;
  return !hasCustomer && !hasMetaOwner;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`orders-get:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const orderId = typeof record.orderId === 'string' ? record.orderId.trim() : '';
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 });
  }

  const customer = await optionalCustomerRequest(request);

  try {
    const numericId = Number(orderId);
    if (Number.isInteger(numericId) && numericId > 0) {
      try {
        const order = await getWooOrder(numericId);
        if (mayViewWooOrder(order, customer)) {
          return NextResponse.json(orderWithItemsFromWoo(order));
        }
        // The store has this order and it is not this caller's. Do not fall through
        // to the legacy store: a Woo order that exists is not a legacy order.
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      } catch (error) {
        // Only a genuine "no such order" falls through to the legacy read; a store
        // failure is answered as a failure so it is not mistaken for a miss.
        if (!isWooOrderNotFound(error)) throw error;
      }
    }

    const legacy = await getLegacyOrderForViewer(orderId, customer?.email ?? null);
    if (!legacy) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    return NextResponse.json(legacy);
  } catch (error) {
    console.error('Order lookup failed:', error);
    return NextResponse.json({ error: 'Unable to load order.' }, { status: 500 });
  }
}
