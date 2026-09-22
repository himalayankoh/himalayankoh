/**
 * Customer cancel order — cancels a pending order in WooCommerce.
 *
 * Checks ownership and verifies status is 'pending' before cancelling.
 */

import { NextResponse } from 'next/server';
import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import {
  WooOrderError,
  appStatusFromWoo,
  getWooOrderForEmail,
  orderWithItemsFromWoo,
  updateWooOrderStatus,
} from '@/lib/woo/orders';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await context.params;
  const orderId = Number(rawId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'A valid order id is required.' }, { status: 400 });
  }

  try {
    const existing = await getWooOrderForEmail(orderId, auth.customer.email);
    if (!existing) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const currentStatus = appStatusFromWoo(existing);
    if (currentStatus !== 'pending') {
      return NextResponse.json(
        { error: `Only pending orders can be cancelled. Order is currently ${currentStatus}.` },
        { status: 400 }
      );
    }

    const updated = await updateWooOrderStatus(orderId, { status: 'cancelled' });
    return NextResponse.json({ ok: true, order: orderWithItemsFromWoo(updated) });
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unable to cancel order.';
    return NextResponse.json({ error: message }, { status });
  }
}
