/**
 * Setting an order's status — a WooCommerce write.
 *
 * This used to write the app's own order table, which is why an owner could mark
 * an order shipped in the console and find it unchanged in WooCommerce. It now
 * writes the store's order: the native WooCommerce status, plus the app's
 * fulfilment state in order meta for the states WooCommerce has no status for
 * (`packed`, `shipped`). See `lib/woo/orders` for why that pairing is the design
 * rather than a registered custom status.
 *
 * The request body is unchanged, so the console's own caller needed no rewrite.
 * An id the store does not recognise answers 404 instead of writing somewhere else.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import {
  WooOrderError,
  orderWithItemsFromWoo,
  updateWooOrderStatus,
  type AppOrderStatus,
  type AppPaymentStatus,
} from '@/lib/woo/orders';

export const dynamic = 'force-dynamic';

const ORDER_STATUSES: AppOrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

const PAYMENT_STATUSES: AppPaymentStatus[] = ['pending', 'paid', 'failed', 'refunded'];

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const rawId = typeof record.orderId === 'string' ? record.orderId.trim() : String(record.orderId ?? '');
  const status = typeof record.status === 'string' ? record.status.trim() : '';
  const paymentStatus = typeof record.paymentStatus === 'string' ? record.paymentStatus.trim() : undefined;
  const trackingNumber =
    typeof record.trackingNumber === 'string' ? record.trackingNumber.trim() : undefined;

  const orderId = Number(rawId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json(
      { error: 'A WooCommerce order id is required. Orders are read from the store, so their ids are the store’s own.' },
      { status: 400 }
    );
  }
  if (!ORDER_STATUSES.includes(status as AppOrderStatus)) {
    return NextResponse.json({ error: 'Invalid order status.' }, { status: 400 });
  }
  if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus as AppPaymentStatus)) {
    return NextResponse.json({ error: 'Invalid payment status.' }, { status: 400 });
  }

  try {
    const updated = await updateWooOrderStatus(orderId, {
      status: status as AppOrderStatus,
      paymentStatus: paymentStatus as AppPaymentStatus | undefined,
      trackingNumber,
    });

    return NextResponse.json({ ok: true, order: orderWithItemsFromWoo(updated) });
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unable to update the order.';
    return NextResponse.json({ error: message }, { status });
  }
}
