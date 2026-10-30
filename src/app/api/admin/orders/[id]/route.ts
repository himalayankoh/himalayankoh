/**
 * One order, for the console's order drawer.
 *
 * Read straight from the store so the detail view cannot show a cached or
 * locally-held copy of an order the shop has since changed — the status the owner
 * sees is the status WooCommerce holds.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WooOrderError, getWooOrder, orderWithItemsFromWoo } from '@/lib/woo/orders';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'An order id is required.' }, { status: 400 });
  }

  try {
    const order = await getWooOrder(id);
    return NextResponse.json({ order: orderWithItemsFromWoo(order) });
  } catch (error) {
    const status = error instanceof WooOrderError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'The order could not be read.';
    return NextResponse.json({ error: message }, { status });
  }
}
