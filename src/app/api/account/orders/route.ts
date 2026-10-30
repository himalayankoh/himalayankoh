/**
 * Customer orders list — reads authoritative orders from WooCommerce for the authenticated customer.
 *
 * Replaces direct Supabase orders read with WooCommerce orders matching the customer's email.
 */

import { NextResponse } from 'next/server';
import { verifyCustomerRequest } from '@/lib/auth/customerRequest';
import {
  WooOrderError,
  listWooOrdersForEmail,
  orderWithItemsFromWoo,
} from '@/lib/woo/orders';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? '1') || 1;
  const perPage = Number(url.searchParams.get('perPage') ?? url.searchParams.get('limit') ?? '10') || 10;

  try {
    const result = await listWooOrdersForEmail(auth.customer.email, {
      page,
      perPage,
      includeGuests: true,
    });

    const orders = result.orders.map(orderWithItemsFromWoo);

    return NextResponse.json({
      orders,
      count: result.total,
      totalPages: result.totalPages,
    });
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unable to read your orders.';
    return NextResponse.json({ error: message }, { status });
  }
}
