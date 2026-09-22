/**
 * Order tracking — by order number and email.
 *
 * The order is read from WooCommerce, where new orders live. An order number that
 * is the store's own id is read directly; anything else is searched, and the
 * billing email must match either way, so knowing an order number is not enough to
 * read somebody's order.
 *
 * A pre-migration order is not in the store, so a Woo miss falls through to the
 * read-only legacy adapter (`lib/orders/legacyOrders`) and the same email check
 * applies there.
 */

import { NextResponse } from 'next/server';
import { resolveTrackingUrl } from '@/lib/orders/tracking';
import { fetchShippoTracking } from '@/lib/shippo/server/tracking';
import { resolveShippoConfigError } from '@/lib/shippo/config';
import { checkRateLimit } from '@/lib/rateLimit';
import { getLegacyOrderByNumberForViewer } from '@/lib/orders/legacyOrders';
import {
  getWooOrder,
  isWooOrderNotFound,
  listWooOrders,
  orderFromWoo,
  type WooOrderLike,
} from '@/lib/woo/orders';
import type { OrderWithItems } from '@/lib/commerce/types';

export const dynamic = 'force-dynamic';

/** The store's order for an order number, or null when it holds none. */
async function findWooOrderByNumber(orderNumber: string): Promise<WooOrderLike | null> {
  const numeric = Number(orderNumber);
  if (Number.isInteger(numeric) && numeric > 0) {
    try {
      return await getWooOrder(numeric);
    } catch (error) {
      if (!isWooOrderNotFound(error)) throw error;
    }
  }
  const searched = await listWooOrders({ search: orderNumber, perPage: 20 });
  return (
    searched.orders.find(
      (order) => String(order.number ?? order.id) === orderNumber || String(order.id) === orderNumber
    ) ?? null
  );
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`track:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const orderNumber = typeof record.orderNumber === 'string' ? record.orderNumber.trim() : '';
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';

  if (!orderNumber || !email) {
    return NextResponse.json({ error: 'Order number and email are required.' }, { status: 400 });
  }

  try {
    const wooOrder = await findWooOrderByNumber(orderNumber);
    let view: OrderWithItems & { items: { product_name: string; quantity: number }[] } | null = null;

    if (wooOrder) {
      const projected = orderFromWoo(wooOrder);
      if (projected.email.trim().toLowerCase() !== email) {
        return NextResponse.json({ error: 'Email does not match this order.' }, { status: 403 });
      }
      view = {
        ...projected,
        order_items: [],
        items: (wooOrder.line_items ?? []).map((line) => ({
          product_name: line.name ?? 'Item',
          quantity: Number(line.quantity ?? 0) || 0,
        })),
      };
    } else {
      const legacy = await getLegacyOrderByNumberForViewer(orderNumber, email);
      if (!legacy) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }
      if (String(legacy.email ?? '').trim().toLowerCase() !== email) {
        return NextResponse.json({ error: 'Email does not match this order.' }, { status: 403 });
      }
      view = {
        ...legacy,
        items: (legacy.order_items ?? []).map((item) => ({
          product_name: item.product_name,
          quantity: Number(item.quantity) || 0,
        })),
      };
    }

    const trackingUrl = resolveTrackingUrl(view);
    let liveTracking: Awaited<ReturnType<typeof fetchShippoTracking>> | null = null;

    if (view.tracking_number && view.shipping_carrier && !(await resolveShippoConfigError())) {
      try {
        liveTracking = await fetchShippoTracking(view.shipping_carrier, view.tracking_number);
      } catch (trackError) {
        console.warn('Shippo live tracking unavailable:', trackError);
      }
    }

    return NextResponse.json({
      order: {
        orderNumber: view.order_number,
        status: view.status,
        paymentStatus: view.payment_status,
        paymentMethod: view.payment_method,
        total: view.total,
        createdAt: view.created_at,
        shippedAt: view.shipped_at,
        carrier: view.shipping_carrier,
        service: view.shipping_service,
        trackingNumber: view.tracking_number,
        trackingUrl: liveTracking?.trackingUrl || trackingUrl,
        items: view.items,
      },
      tracking: liveTracking
        ? {
            status: liveTracking.status,
            statusDetails: liveTracking.statusDetails,
            events: liveTracking.events,
          }
        : null,
    });
  } catch (error) {
    console.error('Order track lookup failed:', error);
    return NextResponse.json({ error: 'Unable to load tracking.' }, { status: 500 });
  }
}
