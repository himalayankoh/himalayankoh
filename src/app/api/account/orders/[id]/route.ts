/**
 * Customer single order detail — reads from WooCommerce for the authenticated customer only.
 *
 * Enforces ownership: returns 404 if the order does not belong to the requesting customer's email,
 * strictly preventing cross-customer ID enumeration.
 */

import { NextResponse } from 'next/server';
import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import {
  WooOrderError,
  getWooOrderForEmail,
  orderWithItemsFromWoo,
} from '@/lib/woo/orders';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const order = await getWooOrderForEmail(orderId, auth.customer.email);
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    return NextResponse.json({ order: orderWithItemsFromWoo(order) });
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unable to read order.';
    return NextResponse.json({ error: message }, { status });
  }
}
